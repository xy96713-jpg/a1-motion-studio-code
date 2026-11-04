#!/usr/bin/env python3
"""Pure synthetic fixtures; never read/write the real A1 env or any real key."""
import builtins
import contextlib
import fcntl
import getpass
import importlib.util
import io
import json
import os
import pathlib
import pty
import re
import select
import socket
import stat
import subprocess
import sys
import tempfile
import termios
import time
import unittest
import uuid
import warnings
from unittest import mock

SOURCE = pathlib.Path(__file__).with_name('configure-minimax-credential-v1.py')
spec = importlib.util.spec_from_file_location('minimax_config_fixture', SOURCE)
helper = importlib.util.module_from_spec(spec)
spec.loader.exec_module(helper)
DUMMY = 'synthetic.FIXTURE_ONLY-key_123'


class ConfigFixtures(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix='a1-minimax-synthetic-')
        # macOS /tmp is a symlink; resolve the temporary fixture parent only.
        self.root = pathlib.Path(self.temporary.name).resolve()
        self.target = self.root / '.env.local'

    def tearDown(self):
        self.temporary.cleanup()

    def write(self, content):
        self.target.write_bytes(content)
        self.target.chmod(0o644)

    def save(self, **options):
        self.assertNotEqual(self.target, helper.TARGET)
        return helper._save_after_human_confirmation(self.target, DUMMY, **options)

    def assert_clean(self):
        self.assertEqual(list(self.root.glob('.minimax-config-*.tmp')), [])

    def test_import_inert_no_file_environment_or_network(self):
        source = SOURCE.read_text()
        with mock.patch('builtins.open', side_effect=AssertionError('file read')), mock.patch('os.open', side_effect=AssertionError('file open')), mock.patch.dict(os.environ, {}, clear=True), mock.patch('socket.socket', side_effect=AssertionError('network')):
            namespace = {'__name__': 'fixture_import_only'}
            exec(compile(source, str(SOURCE), 'exec'), namespace)
        self.assertIn('main', namespace)

    def test_byte_preservation_crlf_duplicates_export(self):
        raw = b'# preserve\r\nOTHER="x$FOO # literal"\r\nMINIMAX_API_KEY=synthetic_old\r\nexport MINIMAX_API_KEY = synthetic_second # drop\r\nLAST=1\r\n'
        expected = b'# preserve\r\nOTHER="x$FOO # literal"\r\nLAST=1\r\nMINIMAX_API_KEY=' + DUMMY.encode() + b'\r\n'
        self.assertEqual(helper.replace_key_bytes(raw, DUMMY), expected)

    def test_multiline_other_value_does_not_become_definition(self):
        raw = b'OTHER="line one\nMINIMAX_API_KEY=literal_in_other_setting\nend"\nMINIMAX_API_KEY=synthetic_old\n'
        expected = raw[:raw.index(b'end"') + len(b'end"\n')] + b'MINIMAX_API_KEY=' + DUMMY.encode() + b'\n'
        self.assertEqual(helper.replace_key_bytes(raw, DUMMY), expected)

    def test_multiline_target_and_single_backtick_literals(self):
        raw = b"A='first\nMINIMAX_API_KEY=keep\nlast'\nMINIMAX_API_KEY=\"synthetic\nold\" # removed\nB=`one\ntwo`\n"
        expected = b"A='first\nMINIMAX_API_KEY=keep\nlast'\nB=`one\ntwo`\nMINIMAX_API_KEY=" + DUMMY.encode() + b'\n'
        self.assertEqual(helper.replace_key_bytes(raw, DUMMY), expected)

    def test_bom_colon_definition_and_missing_final_newline(self):
        raw = b'\xef\xbb\xbfMINIMAX_API_KEY: synthetic_old\nOTHER=kept'
        self.assertEqual(helper.replace_key_bytes(raw, DUMMY), b'\xef\xbb\xbfOTHER=kept\nMINIMAX_API_KEY=' + DUMMY.encode() + b'\n')

    def test_escaped_double_quote_preserved(self):
        raw = b'OTHER="a\\\"b" # keep\n'
        self.assertEqual(helper.replace_key_bytes(raw, DUMMY), raw + b'MINIMAX_API_KEY=' + DUMMY.encode() + b'\n')

    def test_empty_add_and_atomic_mode(self):
        self.assertEqual(self.save(), 'SAVED_NOT_VALIDATED')
        self.assertEqual(self.target.read_bytes(), b'MINIMAX_API_KEY=' + DUMMY.encode() + b'\n')
        self.assertEqual(stat.S_IMODE(self.target.stat().st_mode), 0o600)
        self.assert_clean()

    def test_existing_replace_byte_preservation_no_backup(self):
        raw = b'# keep\nOTHER=untouched\nMINIMAX_API_KEY=synthetic_old\n'
        self.write(raw)
        self.assertEqual(self.save(), 'SAVED_NOT_VALIDATED')
        self.assertEqual(self.target.read_bytes(), helper.replace_key_bytes(raw, DUMMY))
        self.assertEqual(sorted(p.name for p in self.root.iterdir()), ['.env.local'])
        self.assertEqual(stat.S_IMODE(self.target.stat().st_mode), 0o600)

    def test_reject_token_injection_controls_expansion(self):
        for bad in ['', 'dummy\nOTHER=bad', 'dummy\r', 'dummy\x00', 'dummy $VAR', 'dummy$VAR', 'dummy"', "dummy'", 'dummy\\', 'dummy#', 'dummy`', 'dummy\t', '非秘密假值']:
            with self.subTest(kind='invalid token'), self.assertRaisesRegex(helper.SafeError, '^KEY_FORMAT_REJECTED$'):
                helper.replace_key_bytes(b'', bad)

    def test_bad_env_aborts_unchanged(self):
        for raw in [b'OTHER="unterminated\nMINIMAX_API_KEY=synthetic\n', b'OTHER="a"notacomment\n', b'A=1\x00']:
            self.write(raw)
            with self.assertRaises(helper.SafeError):
                self.save()
            self.assertEqual(self.target.read_bytes(), raw)
            self.assertEqual(stat.S_IMODE(self.target.stat().st_mode), 0o644)
            self.assert_clean()

    def test_symlink_and_hardlink_rejected(self):
        victim = self.root / 'victim'
        victim.write_bytes(b'OTHER=untouched\n')
        self.target.symlink_to(victim)
        with self.assertRaises((OSError, helper.SafeError)):
            self.save()
        self.target.unlink()
        os.link(victim, self.target)
        with self.assertRaisesRegex(helper.SafeError, '^TARGET_FILE_REJECTED$'):
            self.save()
        self.assertEqual(victim.read_bytes(), b'OTHER=untouched\n')
        self.assert_clean()

    def test_ancestor_symlink_and_nonregular_rejected(self):
        actual = self.root / 'actual'
        actual.mkdir()
        link = self.root / 'link'
        link.symlink_to(actual, target_is_directory=True)
        with self.assertRaises((OSError, helper.SafeError)):
            helper._save_after_human_confirmation(link / '.env.local', DUMMY)
        self.target.mkdir()
        with self.assertRaises((OSError, helper.SafeError)):
            self.save()
        self.assertEqual(list(actual.iterdir()), [])

    def test_foreign_owner_rejected(self):
        self.write(b'OTHER=kept\n')
        real_fstat = os.fstat
        def foreign(fd):
            original = real_fstat(fd)
            if stat.S_ISREG(original.st_mode):
                fields = list(original)
                fields[4] = os.getuid() + 1
                return os.stat_result(fields)
            return original
        with mock.patch.object(helper.os, 'fstat', side_effect=foreign), self.assertRaisesRegex(helper.SafeError, '^TARGET_FILE_REJECTED$'):
            self.save()
        self.assertEqual(self.target.read_bytes(), b'OTHER=kept\n')

    def test_observed_concurrent_edit_or_creation_aborts(self):
        self.write(b'OTHER=original\n')
        with self.assertRaisesRegex(helper.SafeError, '^TARGET_CHANGED$'):
            self.save(before_replace=lambda: self.target.write_bytes(b'OTHER=external_edit\n'))
        self.assertEqual(self.target.read_bytes(), b'OTHER=external_edit\n')
        self.target.unlink()
        with self.assertRaisesRegex(helper.SafeError, '^TARGET_CHANGED$'):
            self.save(before_replace=lambda: self.target.write_bytes(b'OTHER=external_create\n'))
        self.assertEqual(self.target.read_bytes(), b'OTHER=external_create\n')
        self.assert_clean()

    def test_replace_failure_and_interrupt_cleanup(self):
        raw = b'OTHER=kept\n'
        self.write(raw)
        with mock.patch.object(helper.os, 'replace', side_effect=OSError('synthetic failure')), self.assertRaises(OSError):
            self.save()
        self.assertEqual(self.target.read_bytes(), raw)
        self.assert_clean()
        def interrupt():
            raise KeyboardInterrupt()
        with self.assertRaises(KeyboardInterrupt):
            self.save(before_replace=interrupt)
        self.assertEqual(self.target.read_bytes(), raw)
        self.assert_clean()

    def test_temp_is_exclusive0600_before_replace(self):
        self.write(b'OTHER=kept\n')
        def inspect():
            files = list(self.root.glob('.minimax-config-*.tmp'))
            self.assertEqual(len(files), 1)
            self.assertEqual(stat.S_IMODE(files[0].stat().st_mode), 0o600)
            self.assertEqual(self.target.read_bytes(), b'OTHER=kept\n')
        self.save(before_replace=inspect)
        self.assert_clean()

    def test_cancel_and_nonexact_save_never_open_env(self):
        for key, confirmation in [('', 'SAVE\n'), (DUMMY, 'cancel\n'), (DUMMY, 'SAVE extra\n'), (DUMMY, '')]:
            with mock.patch.object(helper, '_save_after_human_confirmation', side_effect=AssertionError('save forbidden')):
                result = helper._interactive(io.StringIO(confirmation), io.StringIO(), lambda *_: key)
                self.assertEqual(result, 'CANCELLED')

    def test_human_save_boundary_with_dummy_only(self):
        with mock.patch.object(helper, 'TARGET', self.target):
            output = io.StringIO()
            self.assertEqual(helper._interactive(io.StringIO('SAVE\n'), output, lambda *_: DUMMY), 'SAVED_NOT_VALIDATED')
            self.assertNotIn(DUMMY, output.getvalue())
        self.assert_clean()

    def test_no_tty_refuses_without_visible_input_or_save(self):
        with mock.patch.object(helper.os, 'open', side_effect=OSError('no tty')), mock.patch.object(helper.os, 'isatty', return_value=False), mock.patch.object(builtins, 'input', side_effect=AssertionError('visible input')):
            with self.assertRaisesRegex(helper.SafeError, '^HIDDEN_TTY_REQUIRED$'):
                helper._open_tty()
        with mock.patch.object(helper, '_target_metadata_only'), mock.patch.object(helper, '_open_tty', side_effect=helper.SafeError('HIDDEN_TTY_REQUIRED')), mock.patch.object(helper, '_save_after_human_confirmation', side_effect=AssertionError('save forbidden')), contextlib.redirect_stdout(io.StringIO()) as output:
            self.assertEqual(helper.main([]), 2)
            self.assertEqual(output.getvalue(), 'HIDDEN_TTY_REQUIRED\n')

    def test_getpass_fallback_is_error_before_echo(self):
        with warnings.catch_warnings(), mock.patch('getpass._raw_input', side_effect=AssertionError('visible input forbidden')):
            warnings.simplefilter('error', getpass.GetPassWarning)
            with self.assertRaises(getpass.GetPassWarning):
                getpass.fallback_getpass('synthetic prompt', stream=io.StringIO())

    def test_actual_hidden_tty_dummy_human_save_only(self):
        master, slave = pty.openpty()
        def controlling_tty():
            os.setsid()
            fcntl.ioctl(0, termios.TIOCSCTTY, 0)
        program = "import importlib.util,pathlib; s=importlib.util.spec_from_file_location('fixture', " + repr(str(SOURCE)) + "); m=importlib.util.module_from_spec(s); s.loader.exec_module(m); m.TARGET=pathlib.Path(" + repr(str(self.target)) + "); raise SystemExit(m.main([]))"
        child = subprocess.Popen([sys.executable, '-B', '-c', program], stdin=slave, stdout=slave, stderr=slave, preexec_fn=controlling_tty, env={'PATH': '/usr/bin:/bin', 'PYTHONDONTWRITEBYTECODE': '1'})
        transcript = bytearray()
        def until(marker):
            deadline = time.monotonic() + 4
            while marker not in transcript:
                if time.monotonic() >= deadline:
                    self.fail('synthetic TTY timeout')
                if select.select([master], [], [], 0.1)[0]:
                    transcript.extend(os.read(master, 4096))
        try:
            until('留空取消'.encode())
            self.assertFalse(termios.tcgetattr(slave)[3] & termios.ECHO)
            self.assertFalse(self.target.exists())
            os.write(master, DUMMY.encode() + b'\n')
            until('其它输入取消'.encode())
            self.assertFalse(self.target.exists())
            os.write(master, b'SAVE\n')
            until(b'SAVED_NOT_VALIDATED')
            self.assertEqual(child.wait(timeout=4), 0)
            self.assertNotIn(DUMMY.encode(), transcript)
            self.assertEqual(self.target.read_bytes(), b'MINIMAX_API_KEY=' + DUMMY.encode() + b'\n')
        finally:
            if child.poll() is None:
                child.kill()
                child.wait()
            os.close(master)
            os.close(slave)

    def test_help_and_argument_rejection_are_inert_and_redacted(self):
        with mock.patch.object(helper, '_target_metadata_only', side_effect=AssertionError('metadata forbidden')), mock.patch.object(helper, '_save_after_human_confirmation', side_effect=AssertionError('save forbidden')), contextlib.redirect_stdout(io.StringIO()) as output:
            self.assertEqual(helper.main(['--help']), 0)
            self.assertEqual(helper.main([DUMMY]), 2)
        self.assertNotIn(DUMMY, output.getvalue())
        self.assertIn('ARGUMENTS_REJECTED', output.getvalue())

    def test_errors_do_not_echo_value_or_exception(self):
        with mock.patch.object(helper, '_target_metadata_only', side_effect=RuntimeError(DUMMY)), contextlib.redirect_stdout(io.StringIO()) as output:
            self.assertEqual(helper.main([]), 2)
        self.assertEqual(output.getvalue(), 'CONFIGURATION_NOT_COMPLETED\n')

    def test_oversize_env_safe_abort(self):
        with self.assertRaisesRegex(helper.SafeError, '^ENV_FORMAT_REJECTED$'):
            helper.replace_key_bytes(b'A' * (helper.MAX_ENV_BYTES + 1), DUMMY)


if __name__ == '__main__':
    # Every fixture path is generated under TemporaryDirectory; no real env reads.
    unittest.main(verbosity=2)
