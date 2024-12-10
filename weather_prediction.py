# 运行此程序可完成数据处理（项目内已存储处理后的数据，前端可利用处理后的数据画图展示）
# 此程序利用raw_data文件夹中的80%数据训练模型，利用后20%数据进行模型预测
# 并利用模型预测了raw data后24小时的数据

# 所得处理后数据的解释(存储在result文件夹中)：
# xxx_test_results.csv：包含xxx测试集(raw_data后20%)的实际值和预测值
# xxx_future_predictions.csv：包含raw_data/xxx.txt未来24小时的预测值

import tensorflow as tf
from tensorflow.keras.models import Sequential
from tensorflow.keras.layers import LSTM, Dense, Dropout
from sklearn.preprocessing import MinMaxScaler
import numpy as np
import pandas as pd
import json
from datetime import datetime
import matplotlib.pyplot as plt
import os

class WeatherPredictor:
    def __init__(self):
        self.models = {}
        self.scalers = {}  # 用于存储数据缩放器
        
    def load_data(self, file_path):
        """加载数据并转换为时间序列格式"""
        data = []
        with open(file_path, 'r') as f:
            for line in f:
                if line.strip():
                    # 解析每行的JSON数据
                    record = json.loads(line.strip())
                    for timestamp, value in record.items():
                        if value.strip():  # 排除空值
                            data.append({
                                'timestamp': datetime.strptime(timestamp, '%Y-%m-%dT%H:%M:%S'),
                                'value': float(value)
                            })
        
        # 转换为DataFrame并按时间排序
        df = pd.DataFrame(data)
        df.set_index('timestamp', inplace=True)
        df.sort_index(inplace=True)
        
        # 重采样到小时级别，使用平均值处理同一小时内的多个数据点
        df = df.resample('H').mean()
        
        # 处理缺失值
        df = df.interpolate(method='time')
        
        return df
        
    def evaluate_model(self, y_true, y_pred):
        """评估模型性能"""
        from sklearn.metrics import mean_squared_error, mean_absolute_error
        mse = mean_squared_error(y_true, y_pred)
        mae = mean_absolute_error(y_true, y_pred)
        rmse = np.sqrt(mse)
        
        return {
            'MSE': mse,
            'MAE': mae,
            'RMSE': rmse
        }
    
    def create_sequences(self, data, seq_length):
        """创建用于LSTM的序列数据"""
        sequences = []
        targets = []
        
        for i in range(len(data) - seq_length):
            seq = data[i:(i + seq_length)]
            target = data[i + seq_length]
            sequences.append(seq)
            targets.append(target)
            
        return np.array(sequences), np.array(targets)
    
    def build_lstm_model(self, seq_length):
        """构建LSTM模型"""
        model = Sequential([
            LSTM(50, activation='relu', input_shape=(seq_length, 1), return_sequences=True),
            Dropout(0.2),
            LSTM(30, activation='relu'),
            Dropout(0.2),
            Dense(1)
        ])
        
        model.compile(optimizer='adam', loss='mse', metrics=['mae'])
        return model
    
    def train_lstm(self, data, seq_length=24, epochs=50, batch_size=32):
        """训练LSTM模型"""
        # 保存时间索引用于绘图
        self.time_index = data.index  # 添加这行来保存原始数据的时间索引
        
        # 数据缩放
        scaler = MinMaxScaler()
        scaled_data = scaler.fit_transform(data.values.reshape(-1, 1))
        self.scalers['lstm'] = scaler
        
        # 创建序列数据
        X, y = self.create_sequences(scaled_data, seq_length)
        
        # 划分训练集和测试集
        train_size = int(len(X) * 0.8)
        X_train, X_test = X[:train_size], X[train_size:]
        y_train, y_test = y[:train_size], y[train_size:]
        
        # 构建和训练模型
        model = self.build_lstm_model(seq_length)
        history = model.fit(
            X_train, y_train,
            epochs=epochs,
            batch_size=batch_size,
            validation_split=0.1,
            verbose=1
        )
        
        # 保存模型
        self.models['lstm'] = model
        
        # 进行预测
        train_pred = model.predict(X_train)
        test_pred = model.predict(X_test)
        
        # 反向转换数据
        train_pred = scaler.inverse_transform(train_pred)
        test_pred = scaler.inverse_transform(test_pred)
        y_train_orig = scaler.inverse_transform(y_train.reshape(-1, 1))
        y_test_orig = scaler.inverse_transform(y_test.reshape(-1, 1))
        
        return {
            'model': model,
            'history': history,
            'train_pred': train_pred,
            'test_pred': test_pred,
            'y_train': y_train_orig,
            'y_test': y_test_orig,
            'X_test': X_test,
            'scaler': scaler
        }
    
    def predict_future_lstm(self, last_sequence, steps=24):
        """使用LSTM模型预测未来数据"""
        model = self.models.get('lstm')
        scaler = self.scalers.get('lstm')
        
        if model is None or scaler is None:
            raise ValueError("请先训练LSTM模型")
        
        current_sequence = last_sequence.copy()
        predictions = []
        
        for _ in range(steps):
            # 缩放数据
            scaled_sequence = scaler.transform(current_sequence.reshape(-1, 1))
            # 预测下一个值
            next_pred = model.predict(scaled_sequence.reshape(1, -1, 1))
            # 反向转换预测值
            next_pred_orig = scaler.inverse_transform(next_pred)[0][0]
            predictions.append(next_pred_orig)
            # 更新序列
            current_sequence = np.roll(current_sequence, -1)
            current_sequence[-1] = next_pred_orig
            
        return np.array(predictions)
    
    def plot_lstm_results(self, results, title):
        """绘制LSTM模型的训练结果"""
        # 设置中文字体
        plt.rcParams['font.sans-serif'] = ['SimHei']  
        plt.rcParams['axes.unicode_minus'] = False     
        
        plt.figure(figsize=(15, 6))
        
        # 使用原始数据的时间索引
        train_size = len(results['train_pred'])
        total_size = train_size + len(results['test_pred'])
        time_index = self.time_index[-total_size:]  # 使用保存的时间索引
        
        # 绘制训练集预测结果
        plt.plot(time_index[:train_size], results['y_train'], 
                label='训练集实际值', color='blue', alpha=0.6)
        plt.plot(time_index[:train_size], results['train_pred'], 
                label='训练集预测值', color='red', alpha=0.6)
        
        # 绘制测试集预测结果
        plt.plot(time_index[train_size:], results['y_test'], 
                label='测试集实际值', color='green', alpha=0.6)
        plt.plot(time_index[train_size:], results['test_pred'], 
                label='测试集预测值', color='orange', alpha=0.6)
        
        # 添加分隔线
        plt.axvline(x=time_index[train_size], color='gray', linestyle='--', alpha=0.5)
        plt.text(time_index[train_size], plt.ylim()[0], '训练集/测试集分界线', 
                rotation=90, verticalalignment='bottom')
        
        plt.title(title, fontsize=12)
        plt.xlabel('时间', fontsize=10)
        
        # 根据数据类型设置y轴标签
        if "Temperature" in title:
            plt.ylabel('温度 (°C)', fontsize=10)
        elif "Humidity" in title:
            plt.ylabel('湿度 (%)', fontsize=10)
        else:
            plt.ylabel('气压 (hPa)', fontsize=10)
        
        plt.legend(fontsize=10, loc='best')
        plt.grid(True, alpha=0.3)
        
        # 旋转x轴日期标签以防重叠
        plt.xticks(rotation=45)
        
        plt.tight_layout()
        plt.show()

def main():
    # 定义输入输出路径
    input_folder = "raw_data"  # 原始数据文件夹
    output_folder = "results"  # 输出结果文件夹

    # 创建输出文件夹（如果不存在）
    if not os.path.exists(output_folder):
        os.makedirs(output_folder)

    predictor = WeatherPredictor()

    # 定义要处理的数据类型
    data_types = {
        'temperature': {
            'file': os.path.join(input_folder, 'temperature.txt'),
            'unit': '°C',
            'title': 'Temperature'
        },
        'humidity': {
            'file': os.path.join(input_folder, 'humidity.txt'),
            'unit': '%',
            'title': 'Humidity'
        },
        'pressure': {
            'file': os.path.join(input_folder, 'pressure.txt'),
            'unit': 'hPa',
            'title': 'Pressure'
        }
    }
    
    # 存储所有结果
    all_results = {}
    
    # 对每种数据类型进行处理
    for data_type, info in data_types.items():
        print(f"\nProcessing {data_type.capitalize()} data...")
        
        # 加载数据
        data = predictor.load_data(info['file'])
        
        # 训练LSTM模型
        print(f"\nTraining LSTM model for {data_type}...")
        lstm_results = predictor.train_lstm(
            data['value'],
            seq_length=24,
            epochs=50,
            batch_size=32
        )
        
        # 评估LSTM模型
        lstm_metrics = predictor.evaluate_model(
            lstm_results['y_test'],
            lstm_results['test_pred']
        )
        print(f"\n{data_type.capitalize()} LSTM Model Evaluation Results:")
        for metric, value in lstm_metrics.items():
            print(f"{metric}: {value:.4f}")
        
        # 绘制LSTM预测结果
        # predictor.plot_lstm_results(lstm_results, f"LSTM {info['title']} Prediction Results")
        
        # 预测未来24小时
        last_sequence = data['value'].values[-24:]
        future_predictions = predictor.predict_future_lstm(last_sequence)
        
        # 保存结果
        all_results[data_type] = {
            'lstm_results': lstm_results,
            'future_predictions': future_predictions,
            'time_index': predictor.time_index,
            'unit': info['unit']
        }
    
    # 导出所有数据
    for data_type, results in all_results.items():
        # 导出测试集结果
        test_time_index = results['time_index'][-len(results['lstm_results']['test_pred']):]
        test_data = pd.DataFrame({
            'timestamp': test_time_index,
            f'actual_{data_type}_{results["unit"]}': results['lstm_results']['y_test'].flatten(),
            f'predicted_{data_type}_{results["unit"]}': results['lstm_results']['test_pred'].flatten()
        })
        test_data.to_csv(os.path.join(output_folder, f'{data_type}_test_results.csv'), index=False)

        # 导出未来预测结果
        last_timestamp = results['time_index'][-1]
        future_timestamps = pd.date_range(
            start=last_timestamp + pd.Timedelta(hours=1),
            periods=24,
            freq='H'
        )
        future_data = pd.DataFrame({
            'timestamp': future_timestamps,
            f'predicted_{data_type}_{results["unit"]}': results['future_predictions']
        })
        future_data.to_csv(os.path.join(output_folder, f'{data_type}_future_predictions.csv'), index=False)

    print("\n数据已导出到CSV文件：")
    for data_type in data_types.keys():
        print(f"- {output_folder}/{data_type}_test_results.csv：包含{data_type}测试集的实际值和预测值")
        print(f"- {output_folder}/{data_type}_future_predictions.csv：包含{data_type}未来24小时的预测值")

if __name__ == "__main__":
    main()