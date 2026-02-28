"""
Run the Desktop Pet backend (Flask app from app package).
Usage:
  set FLASK_APP=run.py
  flask run
  # or: python run.py
"""
import os

from app import create_app

app = create_app()

if __name__ == "__main__":
    app.run(
        host=os.getenv("FLASK_HOST", "0.0.0.0"),
        port=int(os.getenv("FLASK_PORT", "5000")),
        debug=os.getenv("FLASK_DEBUG", "true").lower() == "true",
    )
