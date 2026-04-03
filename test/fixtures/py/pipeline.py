"""
Data ingestion pipeline.

Reads records from a source (file, DB, or HTTP), validates them,
applies transforms, and writes to a sink. Supports resumable runs
via a checkpoint file.

Scenario target (decorator + docstring + method edit):
 - Add a @retry(max_attempts=3) decorator to `_fetch_batch`
 - Change `DEFAULT_BATCH_SIZE` from 100 to 500
 - Add a `dry_run: bool = False` param to Pipeline.__init__
 - Update the docstring of `run()` to mention the dry_run behaviour
"""

from __future__ import annotations

import csv
import json
import logging
import time
from dataclasses import dataclass, field
from functools import wraps
from pathlib import Path
from typing import Any, Callable, Generator, Iterator, TypeVar

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

DEFAULT_BATCH_SIZE: int = 100
DEFAULT_CHECKPOINT_FILE: str = ".pipeline_checkpoint"
MAX_CONSECUTIVE_ERRORS: int = 5

# ---------------------------------------------------------------------------
# Retry decorator
# ---------------------------------------------------------------------------

F = TypeVar("F", bound=Callable[..., Any])


def retry(max_attempts: int = 3, delay: float = 1.0, backoff: float = 2.0) -> Callable[[F], F]:
    """Retry decorator with exponential backoff.

    Args:
        max_attempts: Maximum number of attempts (including the first).
        delay: Initial delay in seconds between retries.
        backoff: Multiplier applied to delay on each retry.
    """

    def decorator(fn: F) -> F:
        @wraps(fn)
        def wrapper(*args: Any, **kwargs: Any) -> Any:
            current_delay = delay
            for attempt in range(1, max_attempts + 1):
                try:
                    return fn(*args, **kwargs)
                except Exception as exc:  # noqa: BLE001
                    if attempt == max_attempts:
                        raise
                    logger.warning(
                        "Attempt %d/%d failed for %s: %s. Retrying in %.1fs.",
                        attempt,
                        max_attempts,
                        fn.__qualname__,
                        exc,
                        current_delay,
                    )
                    time.sleep(current_delay)
                    current_delay *= backoff

        return wrapper  # type: ignore[return-value]

    return decorator


# ---------------------------------------------------------------------------
# Records & validation
# ---------------------------------------------------------------------------


@dataclass
class Record:
    """A single pipeline record."""

    id: str
    payload: dict[str, Any]
    source: str
    ingested_at: float = field(default_factory=time.time)

    def __post_init__(self) -> None:
        if not self.id:
            raise ValueError("Record.id must not be empty.")
        if not isinstance(self.payload, dict):
            raise TypeError(f"Record.payload must be a dict, got {type(self.payload).__name__}.")


@dataclass
class ValidationResult:
    """Outcome of running a record through the validator."""

    valid: bool
    record: Record
    errors: list[str] = field(default_factory=list)

    @property
    def invalid(self) -> bool:
        return not self.valid


class Validator:
    """Schema-less record validator.

    Applies a sequence of rule functions, each returning a list of error
    strings (empty list means the rule passed).
    """

    def __init__(self, rules: list[Callable[[Record], list[str]]] | None = None) -> None:
        self._rules: list[Callable[[Record], list[str]]] = rules or []

    def add_rule(self, rule: Callable[[Record], list[str]]) -> None:
        """Register an additional validation rule."""
        self._rules.append(rule)

    def validate(self, record: Record) -> ValidationResult:
        """Run all rules against `record` and return a combined result."""
        errors: list[str] = []
        for rule in self._rules:
            errors.extend(rule(record))
        return ValidationResult(valid=len(errors) == 0, record=record, errors=errors)


# ---------------------------------------------------------------------------
# Sources
# ---------------------------------------------------------------------------


class Source:
    """Abstract base class for pipeline sources."""

    def read(self) -> Iterator[dict[str, Any]]:
        """Yield raw dicts from the source."""
        raise NotImplementedError


class JsonFileSource(Source):
    """Read records from a newline-delimited JSON file."""

    def __init__(self, path: str | Path) -> None:
        self._path = Path(path)

    def read(self) -> Iterator[dict[str, Any]]:
        """Yield one dict per line, skipping blank lines and comment lines."""
        with self._path.open(encoding="utf-8") as f:
            for lineno, line in enumerate(f, start=1):
                stripped = line.strip()
                if not stripped or stripped.startswith("#"):
                    continue
                try:
                    yield json.loads(stripped)
                except json.JSONDecodeError as exc:
                    logger.warning("Skipping malformed JSON on line %d: %s", lineno, exc)


class CsvFileSource(Source):
    """Read records from a CSV file, using the header row as field names."""

    def __init__(self, path: str | Path, delimiter: str = ",") -> None:
        self._path = Path(path)
        self._delimiter = delimiter

    def read(self) -> Iterator[dict[str, Any]]:
        """Yield one dict per data row."""
        with self._path.open(newline="", encoding="utf-8") as f:
            reader = csv.DictReader(f, delimiter=self._delimiter)
            yield from reader


# ---------------------------------------------------------------------------
# Sinks
# ---------------------------------------------------------------------------


class Sink:
    """Abstract base class for pipeline sinks."""

    def write(self, records: list[Record]) -> None:
        """Persist a batch of records."""
        raise NotImplementedError

    def close(self) -> None:
        """Release any held resources."""


class JsonFileSink(Sink):
    """Append records to a newline-delimited JSON file."""

    def __init__(self, path: str | Path) -> None:
        self._path = Path(path)
        self._fh = self._path.open("a", encoding="utf-8")

    def write(self, records: list[Record]) -> None:
        for record in records:
            line = json.dumps({"id": record.id, "payload": record.payload, "source": record.source})
            self._fh.write(line + "\n")
        self._fh.flush()

    def close(self) -> None:
        self._fh.close()


# ---------------------------------------------------------------------------
# Checkpoint
# ---------------------------------------------------------------------------


class Checkpoint:
    """Tracks the last successfully processed record ID for resumable runs."""

    def __init__(self, path: str | Path = DEFAULT_CHECKPOINT_FILE) -> None:
        self._path = Path(path)
        self._last_id: str | None = None

    def load(self) -> str | None:
        """Return the last checkpointed record ID, or None if no checkpoint exists."""
        if not self._path.exists():
            return None
        try:
            data = json.loads(self._path.read_text(encoding="utf-8"))
            self._last_id = data.get("last_id")
            return self._last_id
        except Exception:  # noqa: BLE001
            logger.warning("Could not read checkpoint at %s — starting from beginning.", self._path)
            return None

    def save(self, record_id: str) -> None:
        """Persist `record_id` as the new checkpoint."""
        self._last_id = record_id
        self._path.write_text(json.dumps({"last_id": record_id}), encoding="utf-8")

    def clear(self) -> None:
        """Delete the checkpoint file."""
        self._path.unlink(missing_ok=True)
        self._last_id = None

    @property
    def last_id(self) -> str | None:
        return self._last_id


# ---------------------------------------------------------------------------
# Pipeline
# ---------------------------------------------------------------------------


@dataclass
class PipelineStats:
    """Accumulated statistics for a pipeline run."""

    read: int = 0
    valid: int = 0
    invalid: int = 0
    written: int = 0
    errors: int = 0
    skipped: int = 0
    elapsed_s: float = 0.0

    @property
    def throughput(self) -> float:
        """Records written per second."""
        return self.written / self.elapsed_s if self.elapsed_s > 0 else 0.0


class Pipeline:
    """Batch data ingestion pipeline with validation, checkpointing, and resumability.

    Args:
        source: Where records come from.
        sink: Where valid records are written.
        validator: Optional schema validator. If None, all records pass.
        batch_size: Number of records to accumulate before flushing to the sink.
        checkpoint: Checkpoint instance for resumable runs.
        id_field: Key in the raw source dict to use as the record ID.
    """

    def __init__(
        self,
        source: Source,
        sink: Sink,
        validator: Validator | None = None,
        batch_size: int = DEFAULT_BATCH_SIZE,
        checkpoint: Checkpoint | None = None,
        id_field: str = "id",
    ) -> None:
        self._source = source
        self._sink = sink
        self._validator = validator
        self._batch_size = batch_size
        self._checkpoint = checkpoint or Checkpoint()
        self._id_field = id_field

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def run(self) -> PipelineStats:
        """Execute the full pipeline run.

        Reads from the source in batches, validates each record, writes valid
        records to the sink, and updates the checkpoint on each successful batch.

        Returns:
            PipelineStats with counts and elapsed time.
        """
        stats = PipelineStats()
        start = time.monotonic()
        resume_from = self._checkpoint.load()
        resuming = resume_from is not None
        consecutive_errors = 0

        try:
            for batch in self._batches(resume_from=resume_from):
                valid_batch: list[Record] = []

                for raw in batch:
                    stats.read += 1

                    if resuming:
                        # Skip records until we pass the checkpoint
                        raw_id = str(raw.get(self._id_field, ""))
                        if raw_id == resume_from:
                            resuming = False
                        else:
                            stats.skipped += 1
                        continue

                    try:
                        record = self._make_record(raw)
                    except (ValueError, TypeError) as exc:
                        logger.warning("Could not create record from raw data: %s", exc)
                        stats.errors += 1
                        consecutive_errors += 1
                        if consecutive_errors >= MAX_CONSECUTIVE_ERRORS:
                            raise RuntimeError(
                                f"Aborting: {consecutive_errors} consecutive errors."
                            ) from exc
                        continue

                    consecutive_errors = 0

                    if self._validator is not None:
                        result = self._validator.validate(record)
                        if result.invalid:
                            logger.debug("Invalid record %s: %s", record.id, result.errors)
                            stats.invalid += 1
                            continue
                        stats.valid += 1
                    else:
                        stats.valid += 1

                    valid_batch.append(record)

                if valid_batch:
                    self._sink.write(valid_batch)
                    stats.written += len(valid_batch)
                    self._checkpoint.save(valid_batch[-1].id)

        finally:
            self._sink.close()
            stats.elapsed_s = time.monotonic() - start

        logger.info(
            "Pipeline finished. read=%d valid=%d invalid=%d written=%d errors=%d elapsed=%.2fs throughput=%.1f rec/s",
            stats.read,
            stats.valid,
            stats.invalid,
            stats.written,
            stats.errors,
            stats.elapsed_s,
            stats.throughput,
        )
        return stats

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    def _fetch_batch(self, source_iter: Iterator[dict[str, Any]]) -> list[dict[str, Any]]:
        """Pull up to `batch_size` raw dicts from `source_iter`."""
        batch: list[dict[str, Any]] = []
        try:
            for _ in range(self._batch_size):
                batch.append(next(source_iter))
        except StopIteration:
            pass
        return batch

    def _batches(self, resume_from: str | None = None) -> Generator[list[dict[str, Any]], None, None]:
        """Yield batches of raw dicts from the source."""
        source_iter = iter(self._source.read())
        while True:
            batch = self._fetch_batch(source_iter)
            if not batch:
                break
            yield batch

    def _make_record(self, raw: dict[str, Any]) -> Record:
        """Construct a Record from a raw source dict."""
        record_id = str(raw.get(self._id_field, ""))
        if not record_id:
            raise ValueError(f"Missing '{self._id_field}' key in raw record: {raw!r}")
        return Record(id=record_id, payload=raw, source=type(self._source).__name__)
