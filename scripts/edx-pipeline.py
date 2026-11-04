#!/usr/bin/env python3
"""
ED-X screencast production pipeline
===================================
通用 ffmpeg zoompan 模板, 支持:
  - 多 beat 镜头 (BEFORE/HOLD/AFTER 默认 3 拍, 可扩展)
  - ease-in-out / ease-out / linear 缓动
  - 中心 / 偏左 / 偏右 zoom center
  - 静态/动态输入 mp4

用法:
  python3 edx-pipeline.py \
    --input work/cap/ed-02-base.mp4 \
    --shot-id ED-02 \
    --beats "[(0.0, 1.00, 0.5, 0.5), (0.5, 1.04, 0.32, 0.45), (1.5, 1.00, 0.5, 0.5)]" \
    --eases "[linear, ease-in-out, ease-out]" \
    --output work/cap-ed02-cine.mp4
"""
import argparse
import subprocess
import json
import sys
from pathlib import Path

# 5 种缓动 (ffmpeg 表达式)
EASES = {
    "linear": lambda t: t,
    "ease-in-out": lambda t: f"(1-cos(PI*({t})))/2",
    "ease-out": lambda t: f"sin(PI*({t})/2)",
    "ease-in": lambda t: f"1-cos(PI*({t})/2)",
    "ease-out-expo": lambda t: f"1-pow(2,(-10*({t})))",  # not exact
}


def build_zoompan_expr(beats, eases, fps, duration_ms):
    """
    beats: [(start_t_sec, end_t_sec, start_z, end_z, cx, cy), ...]
    eases: ["ease-in-out", ...] len = len(beats)
    fps: output fps
    duration_ms: total duration ms

    构造方式: lt/on 按 on 排序, 每段 [f0, f1)
    最终表达式: 链式 if
    """
    total_frames = int(duration_ms / 1000 * fps)
    if not beats:
        return "1"

    frame_beats = []
    for b in beats:
        t0, t1, z0, z1, cx, cy = b
        f0 = int(t0 * fps)
        f1 = int(t1 * fps)
        frame_beats.append((f0, f1, z0, z1, cx, cy))

    # 简化构造: 每一段产生 1 个 if
    # if(lt(on, f0), PREV, if(lt(on, f1), MID, NEXT))
    # PREV = 前一段的 final z
    # MID = 当前段 z 缓动
    # NEXT = 下一段开始 = 当前段 final z (缓动完)
    # 最末尾: 当前段 final z

    # 改为顺序构造, 每段生成 if(lt(on, f0), z_left, ...)
    # z_left = 前一段结束时的 z (前一段 final z, 不带缓动)
    # z_at_segment(seg) = 段内缓动 (如果 z0!=z1) 或 z0
    # 段结束 z = z1

    # 用栈式构造
    # expr = ""
    # for i, (f0, f1, z0, z1) in enumerate(frame_beats):
    #     seg_z = z_expr_for_segment(...)
    #     if i == 0:
    #         # 第一段: if(lt(on, f1), seg_z, NEXT)
    #         expr = f"if(lt(on,{f1}),{seg_z},"
    #     else:
    #         # 后续段: 在前一个 lt(f1) 后追加
    #         # 前一段 NEXT 是当前段 seg_z
    #         ...
    # 太复杂, 改用单次循环 + 嵌套 if 累积

    # 实际: 把 beats 排序 (按 f0), 然后:
    # 每一段在 f1 处产生一个 if
    # 段内 if(lt(on, f0), PREV_SEG_END_Z, SEG_Z(f))
    # 简化: 假设 on 严格递增, 用嵌套 if 链
    # 最终: if(lt(on,f0_0), z_at_seg0, if(lt(on,f1_0), z_at_seg0, if(lt(on,f1_1), z_at_seg1, ...)))

    # 用简单递归: 表达每一段的"on 在该段区间"时的 z 值
    # 然后链式 if 在每一段 f1 处切换

    def seg_z_expr(idx, on_var="on"):
        """第 idx 段内的 z 缓动表达式"""
        f0, f1, z0, z1, cx, cy = frame_beats[idx]
        if z0 == z1:
            return str(z0), z1
        t_local = f"({on_var}-{f0})/{f1 - f0}"
        ease = eases[idx] if idx < len(eases) else "ease-in-out"
        if ease == "linear":
            eased = t_local
        elif ease == "ease-in-out":
            eased = f"(1-cos(PI*({t_local})))/2"
        elif ease == "ease-out":
            eased = f"sin(PI*({t_local})/2)"
        elif ease == "ease-in":
            eased = f"1-cos(PI*({t_local})/2)"
        else:
            eased = t_local
        return f"({z0}+({z1}-{z0})*{eased})", z1

    # 链式: 表达 on 在每一段 f1 处的 z
    # 段 0: 0 -> f1_0
    # 段 1: f1_0 -> f1_1
    # ...
    # 段 N-1: f1_{N-2} -> f1_{N-1}
    # on >= f1_{N-1}: 段 N-1 的 final z
    # 段 N-1 final z 表达式就是 seg_z_expr 但 t_local = 1

    # 实际: 构造嵌套 if 从最内层开始
    # 在 seg_i 范围内 on 在 [f0_i, f1_i) -> seg_z_expr(i)
    # 在 seg_i 范围外 (on >= f1_i) -> 段 i 的 final z = z1_i
    # 那么:
    # expr_i = if(lt(on, f1_i), seg_z_expr(i), z1_i)
    # 总 expr = expr_0 嵌套 expr_1 嵌套 ...

    # 但 seg_i 范围有 f0 限制, 我们要确保 on >= f0_i
    # 最外层 if(lt(on, f0_0), DEFAULT, expr_0)
    # DEFAULT 是 seg_0 之前的 z, 我们取 z0_0 (段 0 起始 z)

    # 段 0: f0=0, f1=f1_0
    # 实际: 第 0 段起始 f0_0 通常 0
    # 如果 on < f0_0 (几乎不可能), 应该是默认值 z0_0
    # 如果 on 在 [f0_0, f1_0): seg_z_expr(0)
    # 如果 on >= f1_0: 段 0 final z = z1_0

    # 实际构造: 从最内层开始
    # innermost = seg_i 在 [f0_i, f1_i) 的 z 表达式
    # 但 seg_i 的 z 表达式就是 seg_z_expr(i), 不需要 if(f0) 因为前面已经处理

    # 完整表达式: if(lt(on, f1_0), seg_z_0, if(lt(on, f1_1), z1_0 (但 seg_1 起始就是 z0_1 = z1_0), seg_z_1, ...))
    # 简化: 段 i 起始 z = 段 i-1 final z
    # 那么段 i 的 seg_z 表达式 (从 f0_i 到 f1_i) 就是 (z0_i + (z1_i - z0_i) * eased), 当 on = f0_i 时 eased = 0
    # 完美连续

    # 总: if(lt(on, f1_0), seg_z_0, if(lt(on, f1_1), seg_z_1, ... seg_z_{N-1}))
    # 最后一段没有 f1, 直接 seg_z_{N-1}
    # 这样最后 on > f1_{N-2} 时落入 seg_z_{N-1}

    parts = []
    for i in range(len(frame_beats)):
        if i < len(frame_beats) - 1:
            f1 = frame_beats[i][1]
            sz, _ = seg_z_expr(i)
            parts.append(f"if(lt(on,{f1}),{sz},")
        else:
            # 最后一段
            sz, _ = seg_z_expr(i)
            parts.append(f"{sz}")
    # close
    for _ in range(len(frame_beats) - 1):
        parts.append(")")

    return "".join(parts)


def build_center_expr(beats, fps):
    """cx/cy 表达式, zoom 中心点
    段 i 起始 f0_i, 中心切换为 cx_i, cy_i
    """
    if not beats:
        return "iw/2-iw/2/zoom", "ih/2-ih/2/zoom"

    # 假设 f0_0=0 (第一段从 0 开始)
    # on < f0_0 永远不可能, 所以不需要最外层 if
    # 段 0: 中心 = cx_0, cy_0
    # 段 i (i>=1): on >= f0_i, 中心 = cx_i, cy_i
    # 段 N-1 之后: cx_{N-1}, cy_{N-1}

    def get_center(idx, dim, var="zoom"):
        cx, cy = beats[idx][4], beats[idx][5]
        if dim == "x":
            return f"iw*{cx}-iw/2/{var}"
        else:
            return f"ih*{cy}-ih/2/{var}"

    # 构造: 段 0 中心 -> if(on>=f0_1) 段 1 中心 -> ... -> 段 N-1 中心
    # 用 if(lt(on, f0_i), PREV, NEXT) 链
    # 起始 PREV = 段 0 中心
    # 最内层 NEXT = 段 N-1 中心

    parts_x = []
    parts_y = []

    for i in range(1, len(beats)):
        f0 = int(beats[i][0] * fps)
        prev_x = get_center(i - 1, "x")
        prev_y = get_center(i - 1, "y")
        parts_x.append(f"if(lt(on,{f0}),{prev_x},")
        parts_y.append(f"if(lt(on,{f0}),{prev_y},")

    # 最后: 段 N-1 中心
    parts_x.append(get_center(len(beats) - 1, "x"))
    parts_y.append(get_center(len(beats) - 1, "y"))

    # close
    for _ in range(len(beats) - 1):
        parts_x.append(")")
        parts_y.append(")")

    return "".join(parts_x), "".join(parts_y)


def render(input_mp4, output_mp4, beats, eases, fps=60, duration_ms=None, crf=17):
    """调用 ffmpeg zoompan 渲染"""
    if duration_ms is None:
        result = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration",
             "-of", "default=noprint_wrappers=1:nokey=1", input_mp4],
            capture_output=True, text=True
        )
        duration_ms = int(float(result.stdout.strip()) * 1000)

    z_expr = build_zoompan_expr(beats, eases, fps, duration_ms)
    x_expr, y_expr = build_center_expr(beats, fps)

    # 截断到指定时长
    t_sec = duration_ms / 1000

    cmd = [
        "ffmpeg", "-y",
        "-i", input_mp4,
        "-t", str(t_sec),
        "-vf",
        f"scale=1920:1080,zoompan=z='{z_expr}':x='{x_expr}':y='{y_expr}':d=1:s=1920x1080:fps={fps}",
        "-an",
        "-c:v", "libx264",
        "-preset", "slow",
        "-crf", str(crf),
        "-pix_fmt", "yuv420p",
        "-movflags", "+faststart",
        output_mp4
    ]

    print("=== ffmpeg command ===")
    print(" ".join(cmd[:8]) + " ...")
    print(f"zoom expr: {z_expr[:100]}...")
    print(f"x expr: {x_expr[:80]}...")
    print(f"y expr: {y_expr[:80]}...")

    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"FAILED: {result.stderr[-2000:]}")
        return False

    print(f"=== DONE: {output_mp4} ===")
    return True


# === 34 镜默认 beats (BEFORE/HOLD/AFTER) ===
# 来源: workspace.json actionContract + timeRange
# BEFORE: z=1, 全景
# HOLD: z=1.04, 选区/操作区偏左
# AFTER: z=1, 全景
DEFAULT_BEATS_3 = [
    # (start_t, end_t, z_start, z_end, cx, cy)
    (0.00, 0.30, 1.00, 1.00, 0.50, 0.50),  # BEFORE
    (0.30, 0.80, 1.00, 1.04, 0.32, 0.45),  # BEFORE→HOLD push
    (0.80, 1.50, 1.04, 1.04, 0.32, 0.45),  # HOLD hold
    (1.50, 1.85, 1.04, 1.00, 0.50, 0.50),  # HOLD→AFTER pull
    (1.85, 2.00, 1.00, 1.00, 0.50, 0.50),  # AFTER hold
]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", required=True)
    ap.add_argument("--output", required=True)
    ap.add_argument("--shot-id", required=True)
    ap.add_argument("--duration-ms", type=int, default=None)
    ap.add_argument("--fps", type=int, default=60)
    ap.add_argument("--crf", type=int, default=17)
    ap.add_argument("--config", default=None, help="JSON config with beats/eases")
    args = ap.parse_args()

    if args.config:
        cfg = json.load(open(args.config))
        beats = [tuple(b) for b in cfg["beats"]]
        eases = cfg.get("eases", ["ease-in-out"] * (len(beats) - 1))
    else:
        beats = DEFAULT_BEATS_3
        eases = ["linear", "ease-in-out", "linear", "ease-in-out", "linear"]

    Path(args.output).parent.mkdir(parents=True, exist_ok=True)
    ok = render(args.input, args.output, beats, eases, args.fps, args.duration_ms, args.crf)
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
