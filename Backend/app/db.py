from __future__ import annotations

from copy import deepcopy
from itertools import count

from flask import current_app, g

try:
    from pymongo import MongoClient
except ModuleNotFoundError:
    MongoClient = None


class _UpdateResult:
    def __init__(self, matched_count: int):
        self.matched_count = matched_count


class _InMemoryCollection:
    _id_counter = count(1)

    def __init__(self):
        self._docs: list[dict] = []

    def find_one(self, query: dict | None = None, projection: dict | None = None, sort=None):
        matches = self.find(query, projection=None, sort=sort)
        first = next(iter(matches), None)
        if first is None:
            return None
        return self._apply_projection(first, projection)

    def find(self, query: dict | None = None, projection: dict | None = None, sort=None):
        query = query or {}
        docs = [deepcopy(doc) for doc in self._docs if self._matches(doc, query)]
        if sort:
            for key, direction in reversed(sort):
                docs.sort(key=lambda item: item.get(key), reverse=direction < 0)
        if projection is not None:
            docs = [self._apply_projection(doc, projection) for doc in docs]
        return docs

    def insert_one(self, document: dict):
        doc = deepcopy(document)
        doc.setdefault("_id", next(self._id_counter))
        self._docs.append(doc)
        return {"inserted_id": doc["_id"]}

    def insert_many(self, documents: list[dict]):
        for document in documents:
            self.insert_one(document)
        return {"inserted_count": len(documents)}

    def update_one(self, query: dict, update: dict, upsert: bool = False):
        for index, doc in enumerate(self._docs):
            if self._matches(doc, query):
                updated = deepcopy(doc)
                for key, value in update.get("$set", {}).items():
                    updated[key] = deepcopy(value)
                self._docs[index] = updated
                return _UpdateResult(1)

        if upsert:
            new_doc = deepcopy(query)
            for key, value in update.get("$setOnInsert", {}).items():
                new_doc[key] = deepcopy(value)
            for key, value in update.get("$set", {}).items():
                new_doc[key] = deepcopy(value)
            self.insert_one(new_doc)
        return _UpdateResult(0)

    def count_documents(self, query: dict | None = None) -> int:
        return len([doc for doc in self._docs if self._matches(doc, query or {})])

    def distinct(self, field: str, query: dict | None = None):
        values = []
        for doc in self._docs:
            if self._matches(doc, query or {}):
                value = doc.get(field)
                if value not in values:
                    values.append(value)
        return values

    def _matches(self, doc: dict, query: dict) -> bool:
        for key, expected in query.items():
            actual = doc.get(key)
            if isinstance(expected, dict):
                for operator, value in expected.items():
                    if operator == "$gte" and not (actual is not None and actual >= value):
                        return False
                    if operator == "$gt" and not (actual is not None and actual > value):
                        return False
                    if operator == "$lt" and not (actual is not None and actual < value):
                        return False
                    if operator == "$lte" and not (actual is not None and actual <= value):
                        return False
                continue
            if actual != expected:
                return False
        return True

    def _apply_projection(self, doc: dict, projection: dict | None):
        result = deepcopy(doc)
        if not projection:
            return result

        include_keys = [key for key, value in projection.items() if value and key != "_id"]
        exclude_keys = [key for key, value in projection.items() if not value]

        if include_keys:
            projected = {key: result.get(key) for key in include_keys if key in result}
            if projection.get("_id", 1) and "_id" in result:
                projected["_id"] = result["_id"]
            return projected

        for key in exclude_keys:
            projected_key = key
            result.pop(projected_key, None)
        return result


class _InMemoryDatabase:
    def __init__(self):
        self._collections: dict[str, _InMemoryCollection] = {}

    def __getattr__(self, name: str):
        if name.startswith("_"):
            raise AttributeError(name)
        return self._collections.setdefault(name, _InMemoryCollection())


_memory_db = _InMemoryDatabase()


def _get_memory_db():
    current_app.logger.warning("Using in-memory fallback database.")
    return _memory_db


def get_db():
    """
    Returns a MongoDB database object, cached on flask.g per request.
    Falls back to an in-memory store when pymongo or the remote database is unavailable.
    """
    if "mongo_db" in g:
        return g.mongo_db

    if MongoClient is None:
        g.mongo_client = None
        g.mongo_db = _get_memory_db()
        return g.mongo_db

    try:
        client = MongoClient(current_app.config["MONGO_URI"], serverSelectionTimeoutMS=1500)
        client.admin.command("ping")
        g.mongo_client = client
        g.mongo_db = client[current_app.config["MONGO_DB"]]
        return g.mongo_db
    except Exception:
        g.mongo_client = None
        g.mongo_db = _get_memory_db()
        return g.mongo_db


def close_db(e=None):
    client = g.pop("mongo_client", None)
    g.pop("mongo_db", None)
    if client is not None:
        client.close()
