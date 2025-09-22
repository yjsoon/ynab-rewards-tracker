# TODO

- [ ] The blocks / total calculation is still wrong. When there are multiple transactions at $1 blocks, e.g. $1.40 and $2.90, the rewards should be $1 x reward rate + $2 x reward rate, with $1.30 "unearned". However, the total rewards calculated instead are based on $4, with $0.30 unearned, because the total calculator takes the total sum and calculates blocks from there. 
