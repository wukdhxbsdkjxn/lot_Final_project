from flask import Flask
from flask_socketio import SocketIO
import os

template_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'templates'))
static_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), 'static'))

app = Flask(__name__, 
           template_folder=template_dir,
           static_folder=static_dir,
           static_url_path='/static')
app.config['SECRET_KEY'] = 'your-secret-key'
socketio = SocketIO(app)

from app import routes 