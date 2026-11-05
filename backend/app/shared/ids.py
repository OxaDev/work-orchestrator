"""UUID version 7 generation (RFC 9562), used for every primary key (ADR-0014).

Python 3.13's standard library has no ``uuid7``; this small implementation avoids a dependency.
Layout: 48-bit Unix ms timestamp | version (4 bits) | 12-bit counter | variant (2 bits)
| 62 random bits.
The 12-bit counter keeps IDs monotonic for several IDs generated within the same millisecond.
"""

import os
import threading
import time
import uuid

_lock = threading.Lock()
_last_ms = 0
_counter = 0
_COUNTER_MAX = 0xFFF


def uuid7() -> uuid.UUID:
    global _last_ms, _counter  # module-level monotonic state
    with _lock:
        now_ms = time.time_ns() // 1_000_000
        if now_ms > _last_ms:
            _last_ms = now_ms
            _counter = int.from_bytes(os.urandom(2)) & 0x3FF  # random start, leaves headroom
        else:
            _counter += 1
            if _counter > _COUNTER_MAX:  # counter overflow: borrow the next millisecond
                _last_ms += 1
                _counter = 0
        timestamp_ms, counter = _last_ms, _counter

    random_bits = int.from_bytes(os.urandom(8)) & ((1 << 62) - 1)
    value = (timestamp_ms & ((1 << 48) - 1)) << 80
    value |= 0x7 << 76
    value |= counter << 64
    value |= 0b10 << 62
    value |= random_bits
    return uuid.UUID(int=value)
