from pymongo import MongoClient
from flask import current_app, g

def get_db():
    """
    Returns a MongoDB database object, cached on flask.g per request.
    """
    if "mongo_db" not in g:
        client = MongoClient(current_app.config["MONGO_URI"])
        g.mongo_client = client
        g.mongo_db = client[current_app.config["MONGO_DB"]]
    return g.mongo_db

def close_db(e=None):
    client = g.pop("mongo_client", None)
    g.pop("mongo_db", None)
    if client is not None:
        client.close()