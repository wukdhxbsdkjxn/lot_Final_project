from flask import render_template, request, jsonify
from app import app, socketio
from app.mqtt_client import mqtt_client
from app.prediction import WeatherPredictor
import json
import pandas as pd
import numpy as np

# 全局变量存储预测结果
prediction_results = None

@app.route('/')
def index():
    return render_template('base.html')

@app.route('/publisher')
def publisher():
    return render_template('publisher.html')

@app.route('/subscriber')
def subscriber():
    return render_template('subscriber.html')

@app.route('/api/connect', methods=['POST'])
def connect():
    try:
        data = request.json
        broker = data.get('broker', 'localhost')
        port = int(data.get('port', 1883))
        
        print(f"Connecting to MQTT broker: {broker}:{port}")
        success = mqtt_client.connect(broker, port)
        
        return jsonify({
            'success': success,
            'message': '连接请求已发送' if success else '连接请求失败'
        })
    except Exception as e:
        print(f"Connection error in route: {e}")
        return jsonify({
            'success': False,
            'message': f'连接错误: {str(e)}'
        }), 500

@app.route('/api/publish', methods=['POST'])
def publish():
    data = request.json
    success = mqtt_client.publish(data)
    return jsonify({'success': success})

@app.route('/api/publish_batch', methods=['POST'])
def publish_batch():
    # 删除这个路由
    pass

@socketio.on('connect')
def handle_connect():
    print('Client connected')

@socketio.on('disconnect')
def handle_disconnect():
    print('Client disconnected')

@app.route('/prediction_results')
def prediction_results():
    return render_template('prediction_results.html')

@app.route('/api/predict', methods=['POST'])
def predict():
    global prediction_results
    try:
        # 获取收集的数据
        data = request.json['data']
        
        # 转换数据格式
        df = pd.DataFrame(data)
        df['timestamp'] = pd.to_datetime(df['timestamp'])
        df.set_index('timestamp', inplace=True)
        
        # 初始化预测器
        predictor = WeatherPredictor()
        
        # 训练模型并获取结果
        results = predictor.train_lstm(df['value'])
        
        # 存储结果（确保时间戳和数据对应）
        prediction_results = {
            'timestamps': results['test_timestamps'].astype('datetime64[s]').tolist(),
            'actual_values': results['y_test'].flatten().tolist(),
            'predicted_values': results['test_pred'].flatten().tolist()
        }
        
        # 按时间排序
        sorted_indices = np.argsort(prediction_results['timestamps'])
        prediction_results['timestamps'] = [prediction_results['timestamps'][i] for i in sorted_indices]
        prediction_results['actual_values'] = [prediction_results['actual_values'][i] for i in sorted_indices]
        prediction_results['predicted_values'] = [prediction_results['predicted_values'][i] for i in sorted_indices]
        
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/prediction_results')
def get_prediction_results():
    if prediction_results is None:
        return jsonify({'error': '没有可用的预测结果'}), 404
    return jsonify(prediction_results) 