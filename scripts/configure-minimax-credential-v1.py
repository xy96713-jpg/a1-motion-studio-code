#!/usr/bin/env python3
"""Human-only, local MiniMax configuration. Import is inert; no provider calls."""
import contextlib
import fcntl
import getpass
import os
import pathlib
import re
import stat
import sys
import termios
import uuid
import warnings

TARGET = pathlib.Path('/Users/a1/Documents/Codex/2026-06-04/remotion-plugin-remotion-openai-curated-hyperframes/work/a1-motion-studio-system-line/apps/studio-next/.env.local')
KEY_NAME = b'MINIMAX_API_KEY'
MAX_ENV_BYTES = 1024 * 1024
ASSIGNMENT = re.compile(rb'^[ \t]*(?:export[ \t]+)?([A-Za-z_][A-Za-z0-9_.-]*)[ \t]*(?:=[ \t]*|:[ \t]+)(.*)$')
TOKEN = re.compile(r'[A-Za-z0-9._~+/\-]+=*\Z', re.ASCII)


class SafeError(Exception):
    """Only enumerated nonsecret codes may reach the terminal."""


def validate_token(value):
    if not isinstance(value, str) or not value or len(value) > 16384 or not TOKEN.fullmatch(value):
        raise SafeError('KEY_FORMAT_REJECTED')
    return value.encode('ascii')


def _quote_closed(value, quote):
    # Match dotenv's single/backtick literals and escaped double quotes.
    for index in range(1, len(value)):
        if value[index:index + 1] != quote:
            continue
        if quote == b'"':
            slash_count = 0
            cursor = index - 1
            while cursor >= 0 and value[cursor:cursor + 1] == b'\\':
                slash_count += 1
                cursor -= 1
            if slash_count % 2:
                continue
        tail = value[index + 1:].strip(b' \t\r\n')
        if tail and not tail.startswith(b'#'):
            raise SafeError('ENV_QUOTED_SYNTAX_REJECTED')
        return True
    return False


def replace_key_bytes(original, value):
    """Pure function: remove target definitions, preserve every other byte."""
    token = validate_token(value)
    if not isinstance(original, bytes) or len(original) > MAX_ENV_BYTES or b'\x00' in original:
        raise SafeError('ENV_FORMAT_REJECTED')
    kept = []
    lines = original.splitlines(keepends=True)
    index = 0
    while index < len(lines):
        start = index
        # A UTF-8 BOM is only valid at file start; preserve it as a separate prefix.
        line = lines[index]
        bom = b'\xef\xbb\xbf' if index == 0 and line.startswith(b'\xef\xbb\xbf') else b''
        match = ASSIGNMENT.match(line[len(bom):].rstrip(b'\r\n'))
        index += 1
        if match:
            name, raw = match.groups()
            if raw[:1] in (b'"', b"'", b'`'):
                quote = raw[:1]
                while not _quote_closed(raw, quote):
                    if index == len(lines):
                        raise SafeError('ENV_UNCLOSED_QUOTE')
                    raw += b'\n' + lines[index].rstrip(b'\r\n')
                    index += 1
            if name == KEY_NAME:
                if bom:
                    kept.append(bom)
                continue
        kept.extend(lines[start:index])
    result = b''.join(kept)
    newline = b'\r\n' if b'\r\n' in original else b'\n'
    if result and not result.endswith((b'\n', b'\r')) and result != b'\xef\xbb\xbf':
        result += newline
    return result + KEY_NAME + b'=' + token + newline


def _open_directory(path):
    """Open each component without following symlinks; keep the directory pinned."""
    path = pathlib.Path(path)
    if not path.is_absolute() or '..' in path.parts:
        raise SafeError('TARGET_PATH_REJECTED')
    descriptor = os.open('/', os.O_RDONLY | os.O_DIRECTORY)
    try:
        for part in path.parts[1:]:
            next_fd = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=descriptor)
            os.close(descriptor)
            descriptor = next_fd
            info = os.fstat(descriptor)
            if info.st_uid not in (0, os.getuid()):
                raise SafeError('TARGET_OWNER_REJECTED')
        if os.fstat(descriptor).st_uid != os.getuid():
            raise SafeError('TARGET_OWNER_REJECTED')
        return descriptor
    except BaseException:
        os.close(descriptor)
        raise


def _identity(info):
    return (info.st_dev, info.st_ino, info.st_size, info.st_mtime_ns, info.st_ctime_ns)


def _regular_owned(info):
    if not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid() or info.st_nlink != 1:
        raise SafeError('TARGET_FILE_REJECTED')
    if info.st_size > MAX_ENV_BYTES:
        raise SafeError('ENV_SIZE_REJECTED')


def _save_after_human_confirmation(target, value, *, before_replace=None):
    """Internal primitive. Interactive main calls ONLY after human types SAVE.

    Tests use synthetic temporary files; the agent must not call it on TARGET.
    Advisory directory/file locks plus inode/mtime checks detect cooperating and
    observed concurrent writers. They cannot lock out arbitrary external writers.
    """
    token = validate_token(value)
    del token
    target = pathlib.Path(target)
    parent_fd = _open_directory(target.parent)
    old_fd = None
    temporary = None
    try:
        fcntl.flock(parent_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        try:
            old_fd = os.open(target.name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=parent_fd)
        except FileNotFoundError:
            original_info = None
            original = b''
        else:
            original_info = os.fstat(old_fd)
            _regular_owned(original_info)
            fcntl.flock(old_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
            with os.fdopen(os.dup(old_fd), 'rb') as handle:
                original = handle.read(MAX_ENV_BYTES + 1)
        replacement = replace_key_bytes(original, value)
        temporary = '.minimax-config-' + uuid.uuid4().hex + '.tmp'
        temp_fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=parent_fd)
        try:
            os.fchmod(temp_fd, 0o600)
            with os.fdopen(os.dup(temp_fd), 'wb') as handle:
                handle.write(replacement)
                handle.flush()
                os.fsync(handle.fileno())
        finally:
            os.close(temp_fd)
        if before_replace is not None:
            before_replace()  # Synthetic fixture hook; never public CLI input.
        check_fd = _open_directory(target.parent)
        try:
            if (os.fstat(check_fd).st_dev, os.fstat(check_fd).st_ino) != (os.fstat(parent_fd).st_dev, os.fstat(parent_fd).st_ino):
                raise SafeError('TARGET_CHANGED')
        finally:
            os.close(check_fd)
        try:
            current = os.stat(target.name, dir_fd=parent_fd, follow_symlinks=False)
        except FileNotFoundError:
            current = None
        if original_info is None:
            if current is not None:
                raise SafeError('TARGET_CHANGED')
        else:
            if current is None or _identity(current) != _identity(original_info) or _identity(os.fstat(old_fd)) != _identity(original_info):
                raise SafeError('TARGET_CHANGED')
            _regular_owned(current)
        os.replace(temporary, target.name, src_dir_fd=parent_fd, dst_dir_fd=parent_fd)
        temporary = None
        try:
            os.fsync(parent_fd)
        except OSError:
            return 'SAVED_NOT_VALIDATED_DURABILITY_UNKNOWN'
        return 'SAVED_NOT_VALIDATED'
    finally:
        if temporary is not None:
            with contextlib.suppress(OSError):
                os.unlink(temporary, dir_fd=parent_fd)
        if old_fd is not None:
            os.close(old_fd)
        os.close(parent_fd)


def _target_metadata_only():
    """No target contents are opened until the final human SAVE."""
    if sys.platform != 'darwin':
        raise SafeError('THIS_MAC_ONLY')
    parent_fd = _open_directory(TARGET.parent)
    try:
        try:
            info = os.stat(TARGET.name, dir_fd=parent_fd, follow_symlinks=False)
        except FileNotFoundError:
            return
        _regular_owned(info)
    finally:
        os.close(parent_fd)


def _open_tty():
    descriptor = None
    try:
        try:
            descriptor = os.open('/dev/tty', os.O_RDWR | os.O_NOCTTY)
        except OSError:
            # A sandbox can deny /dev/tty while Terminal supplies a real stdin
            # TTY. This uses that same hidden terminal, never visible input.
            if not os.isatty(0):
                raise SafeError('HIDDEN_TTY_REQUIRED')
            descriptor = os.dup(0)
        if not os.isatty(descriptor):
            raise SafeError('HIDDEN_TTY_REQUIRED')
        termios.tcgetattr(descriptor)
        return descriptor
    except (OSError, termios.error):
        if descriptor is not None:
            os.close(descriptor)
        raise SafeError('HIDDEN_TTY_REQUIRED') from None
    except BaseException:
        if descriptor is not None:
            os.close(descriptor)
        raise


def _interactive(tty_reader, tty_writer, hidden_input):
    tty_writer.write('MiniMax 本机配置\n保存位置：' + str(TARGET) + '\n'
                     '这是明文本地服务端配置，不是加密密码库；保存后权限为 0600。\n'
                     '仅写 MINIMAX_API_KEY；其它配置保留；不生成、不查询、不充值。\n'
                     'A1 服务端可读取环境变量；普通子进程可能继承。MiniMax bridge 会清理子进程环境。\n'
                     '请使用已撤销聊天泄露值后新建的 key；不要发到聊天。\n')
    tty_writer.flush()
    value = hidden_input('输入新 key（隐藏输入，留空取消）：', tty_writer)
    if not value:
        return 'CANCELLED'
    validate_token(value)
    tty_writer.write('输入 SAVE 并回车才最终保存；其它输入取消：')
    tty_writer.flush()
    confirmation = tty_reader.readline(16)
    if confirmation.rstrip('\r\n') != 'SAVE':
        return 'CANCELLED'
    return _save_after_human_confirmation(TARGET, value)


def main(arguments=None):
    arguments = sys.argv[1:] if arguments is None else arguments
    if arguments == ['--help']:
        print('用户本人运行；隐藏 TTY 输入新 key → 输入 SAVE 最终保存。')
        print('固定本机位置：' + str(TARGET))
        print('不读取现有配置内容，不启动网络或服务；存在也仅 NOT_VALIDATED。')
        return 0
    if arguments:
        print('ARGUMENTS_REJECTED')
        return 2
    descriptor = None
    try:
        _target_metadata_only()
        descriptor = _open_tty()
        with os.fdopen(os.dup(descriptor), 'r', encoding='utf-8') as reader, os.fdopen(os.dup(descriptor), 'w', encoding='utf-8', buffering=1) as writer:
            def hidden(prompt, stream):
                with warnings.catch_warnings():
                    warnings.simplefilter('error', getpass.GetPassWarning)
                    return getpass.getpass(prompt, stream=stream)
            outcome = _interactive(reader, writer, hidden)
            writer.write('\n' + outcome + '\n')
            if outcome.startswith('SAVED'):
                writer.write('仅保存配置，尚未验证有效性/余额/计费。请回到 A1；服务读取与真实生成另行受控。\n')
        return 0
    except (KeyboardInterrupt, EOFError):
        print('CANCELLED')
        return 1
    except getpass.GetPassWarning:
        print('HIDDEN_TTY_REQUIRED')
        return 2
    except SafeError as error:
        print(str(error))
        return 2
    except Exception:
        # Never echo exceptions that might contain target bytes, token or argv.
        print('CONFIGURATION_NOT_COMPLETED')
        return 2
    finally:
        if descriptor is not None:
            os.close(descriptor)


if __name__ == '__main__':
    sys.exit(main())
