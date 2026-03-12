# Tmux layout functions — source this from ~/.zshrc or ~/.bashrc:
#   source /path/to/tmux-layouts.sh

# Factory: 1 tall left pane + 2 stacked right panes
factory() {
  tmux attach -t factory 2>/dev/null && return
  tmux new-session -d -s factory
  tmux split-window -h -t factory
  tmux split-window -v -t factory:0.1
  tmux select-pane -t factory:0.0
  tmux attach -t factory
}

# Parallel: 4 horizontal panes (stacked, for vertical monitor) with indigo borders
parallel() {
  tmux attach -t parallel 2>/dev/null && return
  tmux new-session -d -s parallel
  tmux split-window -v -t parallel
  tmux split-window -v -t parallel:0.0
  tmux split-window -v -t parallel:0.2
  tmux select-layout -t parallel even-vertical
  tmux set -t parallel pane-border-style 'fg=colour236'
  tmux set -t parallel pane-active-border-style 'fg=colour201,bold'
  tmux set -t parallel pane-border-lines heavy
  tmux set -t parallel pane-border-indicators colour
  tmux set -t parallel window-style 'bg=colour234,fg=colour245'
  tmux set -t parallel window-active-style 'bg=terminal'
  tmux attach -t parallel
}

# CCTV: 2x2 checkerboard grid with indigo borders
cctv() {
  tmux attach -t cctv 2>/dev/null && return
  tmux new-session -d -s cctv
  tmux split-window -h -t cctv
  tmux split-window -v -t cctv:0.1
  tmux select-pane -t cctv:0.0
  tmux split-window -v -t cctv
  tmux set -t cctv pane-border-style 'fg=colour236'
  tmux set -t cctv pane-active-border-style 'fg=colour201,bold'
  tmux set -t cctv pane-border-lines heavy
  tmux set -t cctv pane-border-indicators colour
  tmux set -t cctv window-style 'bg=colour234,fg=colour245'
  tmux set -t cctv window-active-style 'bg=terminal'
  tmux select-pane -t cctv:0.0
  tmux attach -t cctv
}
