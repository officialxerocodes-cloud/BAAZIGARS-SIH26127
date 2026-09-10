"""Deterministic vehicle -> plate assignment (ARCHITECTURE.md §4).

plate = f(deterministic hash of veh_id): DL + 2 digits + 1-2 letters + 4 digits.
Same vehicle reads as the same plate at every camera, with zero shared state.
"""
import hashlib

_LETTERS = "ABCDEFGHJKLMNPRSTUVWXYZ"  # no I, O (confusable-free by construction)


def plate_for(veh_id: str) -> str:
    h = hashlib.md5(f"plate|{veh_id}".encode()).hexdigest()
    d2 = str(int(h[0:4], 16) % 90 + 10)                      # 10..99
    n_mid = 1 + (int(h[4:6], 16) % 2)                        # 1 or 2 letters
    mid = "".join(_LETTERS[int(h[6 + 2 * i:8 + 2 * i], 16) % len(_LETTERS)] for i in range(n_mid))
    d4 = str(int(h[14:20], 16) % 9000 + 1000)                # 1000..9999
    return f"DL{d2}{mid}{d4}"
