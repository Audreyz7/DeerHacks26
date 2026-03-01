from flask import Flask
from .config import Config
from .routes.water import bp as water_bp
from .routes.stress import bp as stress_bp
from .routes.encouragement import bp as encouragement_bp
from .routes.breaks import bp as breaks_bp
from .routes.chat import bp as chat_bp
from .routes.settings import bp as settings_bp
from .routes.video import bp as video_bp

def create_app():
    app = Flask(__name__)
    app.config.from_object(Config)

    from .db import close_db
    app.teardown_appcontext(close_db)

    app.register_blueprint(water_bp, url_prefix="/api/water")
    app.register_blueprint(stress_bp, url_prefix="/api/stress")
    app.register_blueprint(encouragement_bp, url_prefix="/api/encouragement")
    app.register_blueprint(breaks_bp, url_prefix="/api/breaks")
    app.register_blueprint(chat_bp, url_prefix="/api/chat")
    app.register_blueprint(settings_bp, url_prefix="/api/settings")
    app.register_blueprint(video_bp, url_prefix="/api/video")

    return app
