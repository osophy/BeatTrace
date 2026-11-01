#!/bin/zsh
set -e

project_dir="${0:A:h:h}"
cd "$project_dir"

separation_python="$project_dir/local-model/.venv-separation/bin/python"
pitch_python="/Users/js/Downloads/anaconda3/envs/beattrace-basicpitch/bin/python"

if [[ ! -x "$separation_python" || ! -x "$pitch_python" ]]; then
  print -u2 "BeatTrace AI environments are missing. See README.md for setup."
  exit 1
fi

print "BeatTrace local AI is starting. Keep this Terminal window open while analyzing music."
DEMUCS_MLX_CACHE_DIR="$project_dir/local-model/.cache/demucs-mlx" "$separation_python" local-model/separation_service.py &
separation_pid=$!
"$pitch_python" local-model/basic_pitch_service.py &
pitch_pid=$!

trap 'kill "$separation_pid" "$pitch_pid" 2>/dev/null || true' EXIT INT TERM
wait
