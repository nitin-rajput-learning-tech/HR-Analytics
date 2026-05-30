from __future__ import annotations

import re

from .constants import BLANK_ALIAS_TOKEN

_BLANK_TEXT_VALUES = {"", "(blank)", "nan", "none"}
_SPACE_PATTERN = re.compile(r"\s+")
_CITY_LOWERCASE_WORDS = {"and", "or", "of", "the", "es", "de", "da", "la", "le"}


def collapse_whitespace(text: str) -> str:
    return _SPACE_PATTERN.sub(" ", text).strip()


def normalize_blankable_text(value: object) -> str | None:
    if value is None:
        return None
    text = collapse_whitespace(str(value))
    if not text or text.casefold() in _BLANK_TEXT_VALUES:
        return None
    return text


def normalize_city_name(value: object) -> str | None:
    text = normalize_blankable_text(value)
    if text is None:
        return None
    if not any(character.isalnum() for character in text):
        return None
    words = text.split(" ")
    normalized: list[str] = []
    last_index = len(words) - 1
    for index, word in enumerate(words):
        normalized.append(_title_city_word(word, is_edge=index in {0, last_index}))
    return " ".join(normalized)


def normalize_display_value(field_name: str, value: object) -> object:
    text = normalize_blankable_text(value)
    if text is None:
        return None
    if field_name == "current_city":
        return normalize_city_name(text)
    return text


def normalize_alias_key(field_name: str, value: object) -> str:
    display_value = normalize_display_value(field_name, value)
    if display_value is None:
        return BLANK_ALIAS_TOKEN
    return str(display_value).casefold()


def _title_city_word(word: str, *, is_edge: bool) -> str:
    parts = re.split(r"([/-])", word)
    normalized_parts: list[str] = []
    for part in parts:
        if not part or part in {"-", "/"}:
            normalized_parts.append(part)
            continue
        lowered = part.casefold()
        if not is_edge and lowered in _CITY_LOWERCASE_WORDS:
            normalized_parts.append(lowered)
            continue
        if part.isupper() and len(part) <= 3:
            normalized_parts.append(part)
            continue
        normalized_parts.append(part[:1].upper() + part[1:].lower())
    return "".join(normalized_parts)
