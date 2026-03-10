#!/bin/bash
SESSION_NAME=tma-agent
LOG_FILE=/var/www/tarot-miniapp/exchange/agent-tmux.log

if tmux has-session -t  2>/dev/null; then
    tmux kill-session -t 
fi

tmux new -d -s 
tmux send-keys -t  cd /var/www/tarot-miniapp Enter
tmux send-keys -t  echo TMA Agent ready! Enter
tmux pipe-pane -t  cat created: 
echo Connect: ssh root@89.125.59.117 tmux attach -t $SESSION_NAME
