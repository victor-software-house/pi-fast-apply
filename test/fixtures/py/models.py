"""
Domain models for the platform API.

Uses plain dataclasses with manual validation rather than Pydantic,
to avoid an external dependency in the fixture.

Scenario target (field + validator edit):
 - Add a `phone: str | None = None` field to UserProfile after `avatar_url`
 - Add a `validate_phone` classmethod that checks E.164 format if phone is set
 - Change UserProfile.bio max length from 500 to 280 characters
 - Add a `tags: list[str]` field to Post with a max-10-tags validator
"""

from __future__ import annotations

import re
import time
from dataclasses import dataclass, field
from enum import Enum
from typing import Any


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------


class UserRole(str, Enum):
    GUEST = "guest"
    VIEWER = "viewer"
    EDITOR = "editor"
    ADMIN = "admin"
    SUPERADMIN = "superadmin"


class PostStatus(str, Enum):
    DRAFT = "draft"
    PUBLISHED = "published"
    ARCHIVED = "archived"


class MediaType(str, Enum):
    IMAGE = "image"
    VIDEO = "video"
    DOCUMENT = "document"
    AUDIO = "audio"


# ---------------------------------------------------------------------------
# Validators (standalone, reusable)
# ---------------------------------------------------------------------------


def validate_email(value: str) -> str:
    """Raise ValueError if `value` is not a plausible email address."""
    # Intentionally loose — real validation happens server-side
    if "@" not in value or "." not in value.split("@", 1)[1]:
        raise ValueError(f"Invalid email address: {value!r}")
    return value.strip().lower()


def validate_slug(value: str) -> str:
    """Raise ValueError if `value` is not a valid URL slug."""
    if not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", value):
        raise ValueError(f"Slug must be lowercase alphanumeric with hyphens, got: {value!r}")
    return value


def validate_url(value: str | None) -> str | None:
    """Raise ValueError if `value` is set but not a plausible HTTP(S) URL."""
    if value is None:
        return None
    if not re.match(r"https?://", value):
        raise ValueError(f"URL must start with http:// or https://, got: {value!r}")
    return value


def clamp_str(value: str, max_len: int, field_name: str) -> str:
    """Raise ValueError if the string exceeds `max_len` characters."""
    if len(value) > max_len:
        raise ValueError(f"{field_name} must not exceed {max_len} characters (got {len(value)}).")
    return value


# ---------------------------------------------------------------------------
# UserProfile
# ---------------------------------------------------------------------------


@dataclass
class UserProfile:
    """Public profile attached to a user account.

    Attributes:
        user_id:    Identifier of the owning user.
        username:   Unique display handle (3–32 chars, alphanumeric + underscores).
        email:      Validated email address; stored normalised to lowercase.
        role:       User's permission level in the system.
        bio:        Optional free-text biography (max 500 chars).
        avatar_url: Optional HTTPS URL of the user's profile picture.
        website:    Optional personal/professional website URL.
        created_at: Unix timestamp (seconds) when the profile was created.
        updated_at: Unix timestamp (seconds) of the most recent change.
        is_active:  Whether the account is currently active.
    """

    user_id: str
    username: str
    email: str
    role: UserRole = UserRole.VIEWER
    bio: str = ""
    avatar_url: str | None = None
    website: str | None = None
    created_at: float = field(default_factory=time.time)
    updated_at: float = field(default_factory=time.time)
    is_active: bool = True

    def __post_init__(self) -> None:
        self.email = validate_email(self.email)
        self._validate_username(self.username)
        self.bio = clamp_str(self.bio, 500, "bio")
        self.avatar_url = validate_url(self.avatar_url)
        self.website = validate_url(self.website)

    @staticmethod
    def _validate_username(value: str) -> None:
        if not (3 <= len(value) <= 32):
            raise ValueError(f"Username must be 3–32 characters, got {len(value)}.")
        if not re.fullmatch(r"[A-Za-z0-9_]+", value):
            raise ValueError(f"Username may only contain letters, digits, and underscores: {value!r}.")

    def touch(self) -> None:
        """Update `updated_at` to the current time."""
        self.updated_at = time.time()

    def to_public_dict(self) -> dict[str, Any]:
        """Return a dict safe to expose in API responses (no internal fields)."""
        return {
            "userId": self.user_id,
            "username": self.username,
            "role": self.role.value,
            "bio": self.bio,
            "avatarUrl": self.avatar_url,
            "website": self.website,
            "createdAt": self.created_at,
        }


# ---------------------------------------------------------------------------
# Post
# ---------------------------------------------------------------------------


@dataclass
class Post:
    """A user-authored post.

    Attributes:
        post_id:      Unique identifier.
        author_id:    User ID of the author.
        slug:         URL-safe identifier, unique per author.
        title:        Post headline (max 200 chars).
        body:         Full post content in Markdown (max 50 000 chars).
        status:       Draft / published / archived.
        published_at: Unix timestamp when the post was first published.
        created_at:   Unix timestamp of creation.
        updated_at:   Unix timestamp of last edit.
    """

    post_id: str
    author_id: str
    slug: str
    title: str
    body: str
    status: PostStatus = PostStatus.DRAFT
    published_at: float | None = None
    created_at: float = field(default_factory=time.time)
    updated_at: float = field(default_factory=time.time)

    def __post_init__(self) -> None:
        self.slug = validate_slug(self.slug)
        self.title = clamp_str(self.title, 200, "title")
        self.body = clamp_str(self.body, 50_000, "body")

    def publish(self) -> None:
        """Transition the post to PUBLISHED status."""
        if self.status == PostStatus.ARCHIVED:
            raise ValueError("Cannot publish an archived post.")
        self.status = PostStatus.PUBLISHED
        if self.published_at is None:
            self.published_at = time.time()
        self.touch()

    def archive(self) -> None:
        """Transition the post to ARCHIVED status."""
        self.status = PostStatus.ARCHIVED
        self.touch()

    def touch(self) -> None:
        self.updated_at = time.time()

    def to_summary_dict(self) -> dict[str, Any]:
        return {
            "postId": self.post_id,
            "authorId": self.author_id,
            "slug": self.slug,
            "title": self.title,
            "status": self.status.value,
            "publishedAt": self.published_at,
        }


# ---------------------------------------------------------------------------
# MediaAttachment
# ---------------------------------------------------------------------------


@dataclass
class MediaAttachment:
    """A file attachment associated with a post or profile.

    Attributes:
        attachment_id: Unique identifier.
        owner_id:      ID of the user or post that owns this attachment.
        url:           Storage URL (must be HTTPS).
        media_type:    Enum indicating the kind of media.
        filename:      Original filename as uploaded, max 255 chars.
        size_bytes:    File size in bytes. Must be non-negative.
        mime_type:     MIME type string, e.g. 'image/webp'.
        alt_text:      Accessibility description for images (max 300 chars).
        created_at:    Unix timestamp of upload.
    """

    attachment_id: str
    owner_id: str
    url: str
    media_type: MediaType
    filename: str
    size_bytes: int
    mime_type: str
    alt_text: str = ""
    created_at: float = field(default_factory=time.time)

    def __post_init__(self) -> None:
        if not self.url.startswith("https://"):
            raise ValueError("Attachment URL must use HTTPS.")
        if self.size_bytes < 0:
            raise ValueError(f"size_bytes must be non-negative, got {self.size_bytes}.")
        self.filename = clamp_str(self.filename, 255, "filename")
        self.alt_text = clamp_str(self.alt_text, 300, "alt_text")


# ---------------------------------------------------------------------------
# Comment
# ---------------------------------------------------------------------------


@dataclass
class Comment:
    """A comment on a post.

    Attributes:
        comment_id: Unique identifier.
        post_id:    The post this comment belongs to.
        author_id:  User who wrote the comment.
        body:       Comment text in plain text (max 2000 chars).
        parent_id:  For threaded replies — ID of the parent comment, or None.
        created_at: Unix timestamp of creation.
        edited_at:  Unix timestamp of last edit, or None.
        is_deleted: Soft-delete flag; body is replaced with '[deleted]' on delete.
    """

    comment_id: str
    post_id: str
    author_id: str
    body: str
    parent_id: str | None = None
    created_at: float = field(default_factory=time.time)
    edited_at: float | None = None
    is_deleted: bool = False

    def __post_init__(self) -> None:
        self.body = clamp_str(self.body, 2_000, "body")

    def edit(self, new_body: str) -> None:
        """Replace the comment body and record the edit timestamp."""
        if self.is_deleted:
            raise ValueError("Cannot edit a deleted comment.")
        self.body = clamp_str(new_body, 2_000, "body")
        self.edited_at = time.time()

    def soft_delete(self) -> None:
        """Soft-delete the comment by replacing its body."""
        self.body = "[deleted]"
        self.is_deleted = True
