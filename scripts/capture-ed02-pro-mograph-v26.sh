#!/bin/bash
# ED-02 v26 — 专业 motion graphics 后期
# 简化版: 用 zoompan 单一 filter, 5 拍分镜缓动

set -e

INPUT="work/cap-native-ed02-v24-real-cap/ed-02-real.mp4"
OUTPUT="work/cap-native-ed02-v26-pro-mograph/v26-ed02-5beats.mp4"
mkdir -p work/cap-native-ed02-v26-pro-mograph

# 总时长 3.45s, 60fps = 207 帧
# zoompan 的 d 参数: output duration in frames, 用 1 帧输入生成 1 帧输出
# 用 s=1920x1080 输出

# zoompan 表达式:
#   t (in "frames") = on (output frame number)
#   我们的 5 拍: on=0-30 (0-0.5s), 30-60, 60-90, 90-120, 120-150 (2.0-2.5s)
#   然后 hold 到 on=207 (3.45s)

# 用 on 而不是 t 因为 zoompan 接受 t 但单位是输出秒
# 简化: 单一 zoom 表达式, 分段函数

ffmpeg -y -i "$INPUT" \
  -vf "scale=3840:2160:flags=lanczos,\
zoompan=z='if(lt(on\,30)\,1\,if(lt(on\,60)\,1+0.05*(1-pow(1-(on-30)/30\,2))\,if(lt(on\,90)\,1.05-0.05*(1-pow(1-(on-60)/30\,2))\,if(lt(on\,120)\,1+0.05*sin(PI*(on-90)/30)\,if(lt(on\,150)\,1.04\,1.04))))):x='iw/2-iw/(2*z)':y='ih/2-ih/(2*z)':d=1:s=1920x1080:fps=60,unsharp=3:3:0.4" \
  -an -c:v libx264 -preset slow -crf 17 -pix_fmt yuv420p -movflags +faststart \
  "$OUTPUT" 2>&1 | tail -10

ls -la "$OUTPUT"
ffprobe -v error -show_entries format=duration:stream=width,height,r_frame_rate -of default=noprint_wrappers=1 "$OUTPUT"
