"""Plate canonicalize + Indian grammar + position-aware confusable fix."""
import re
import string

# Indian plates: 2 letters + 1-2 digits + 1-3 letters + 4 digits, plus BH variant
GRAMMAR = re.compile(r"^[A-Z]{2}[0-9]{1,2}[A-Z]{1,3}[0-9]{4}$")
BH_GRAMMAR = re.compile(r"^[0-9]{2}BH[0-9]{4}[A-Z]{1,2}$")

# confusable pairs: digit-like in letter zones and vice-versa
CONFUSABLE = {
    "0": "O", "O": "0",
    "1": "I", "I": "1",
    "8": "B", "B": "8",
    "5": "S", "S": "5",
    "2": "Z", "Z": "2",
    "6": "G", "G": "6",
}

BH_SUFFIX_CONFUSABLE = {"8": "B", "B": "8", "6": "G", "G": "6", "5": "S", "S": "5", "2": "Z", "Z": "2"}

def canonicalize(raw: str) -> str:
    if not raw:
        return ""
    s = raw.upper()
    s = re.sub(r"[^A-Z0-9]", "", s)
    return s

def char_class_at(pos: int, length: int) -> str:
    """Rough: first 2 are letters, last 4 are digits, middle mixed."""
    if pos < 2:
        return "letter"
    if pos >= length - 4:
        return "digit"
    return "alnum"

def correct_plate(canonical: str, char_confs: list[float] | None = None, threshold: float = 0.6) -> tuple[str, float]:
    """Position-aware correction. Only flips low-confidence chars."""
    if not canonical:
        return canonical, 0.0
    # BH plates: first 2 are digits, next 2 = BH, next 4 digits, last 1-2 letters
    is_bh = len(canonical) >= 6 and canonical[2:4] == "BH"
    if is_bh:
        chars = list(canonical)
        # first two must be digits
        start = 0
        end = 2
        for i in range(start, end):
            if char_confs and char_confs[i] >= threshold:
                continue
            c = chars[i]
            if c in ("O", "I", "B", "S", "Z", "G", "A"):
                mapping = {"O": "0", "I": "1", "B": "8", "S": "5", "Z": "2", "G": "6", "A": "4"}
                if c in mapping:
                    chars[i] = mapping[c]
        # chars 4-8 must be digits (after BH)
        for i in range(4, min(8, len(chars))):
            if char_confs and char_confs[i] >= threshold:
                continue
            c = chars[i]
            if c in ("O", "I", "B", "S", "Z", "G", "A"):
                mapping = {"O": "0", "I": "1", "B": "8", "S": "5", "Z": "2", "G": "6", "A": "4"}
                if c in mapping:
                    chars[i] = mapping[c]
        # suffix 1-2 must be letters
        for i in range(max(8, 0), len(chars)):
            if char_confs and char_confs[i] >= threshold:
                continue
            c = chars[i]
            if c in BH_SUFFIX_CONFUSABLE:
                chars[i] = BH_SUFFIX_CONFUSABLE[c]
                # BH suffix confusable handling prefers letter form; re-map digits to letters where needed
                if chars[i] in ("8", "6", "5", "2"):
                    back = {"8": "B", "6": "G", "5": "S", "2": "Z"}
                    chars[i] = back.get(chars[i], chars[i])
            elif c in ("0", "1"):
                chars[i] = {"0": "O", "1": "I"}.get(c, c)
        return "".join(chars), 1.0

    if GRAMMAR.match(canonical):
        return canonical, 1.0
    if len(canonical) < 6:
        return canonical, 0.5
    chars = list(canonical)
    n = len(chars)
    for i, c in enumerate(chars):
        if char_confs and char_confs[i] >= threshold:
            continue
        zone = char_class_at(i, n)
        if zone == "letter" and c in "01258":
            flip = {"0": "O", "1": "I", "2": "Z", "5": "S", "8": "B"}.get(c)
            if flip:
                chars[i] = flip
        elif zone == "digit" and c in "OIBSZG":
            flip = {"O": "0", "I": "1", "B": "8", "S": "5", "Z": "2", "G": "6"}.get(c)
            if flip:
                chars[i] = flip
    corrected = "".join(chars)
    return corrected, 0.85 if corrected != canonical else 1.0

def is_valid(canonical: str) -> bool:
    return bool(GRAMMAR.match(canonical) or BH_GRAMMAR.match(canonical))

def levenshtein(a: str, b: str) -> int:
    if a == b:
        return 0
    la, lb = len(a), len(b)
    if la == 0:
        return lb
    if lb == 0:
        return la
    prev = list(range(lb + 1))
    for i, ca in enumerate(a, 1):
        cur = [i] + [0] * lb
        for j, cb in enumerate(b, 1):
            cost = 0 if ca == cb else 1
            cur[j] = min(prev[j] + 1, cur[j-1] + 1, prev[j-1] + cost)
        prev = cur
    return prev[lb]

def fuzzy_match(query: str, candidate: str, max_dist: int = 1) -> bool:
    return levenshtein(query, candidate) <= max_dist
