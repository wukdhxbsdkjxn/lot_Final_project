import numpy as np
import pandas as pd
from tensorflow.keras.models import Sequential
from tensorflow.keras.layers import LSTM, Dense, Dropout
from sklearn.preprocessing import MinMaxScaler
from sklearn.metrics import mean_squared_error, mean_absolute_error

class WeatherPredictor:
    def __init__(self):
        self.model = None
        self.scaler = MinMaxScaler()
        self.seq_length = 24  # 默认序列长度
        
    def prepare_sequences(self, data, seq_length):
        """准备序列数据"""
        sequences = []
        targets = []
        
        for i in range(len(data) - seq_length):
            seq = data[i:i + seq_length]
            target = data[i + seq_length]
            sequences.append(seq)
            targets.append(target)
            
        return np.array(sequences), np.array(targets)
    
    def train_lstm(self, data, seq_length=24, train_split=0.8, epochs=20, batch_size=16):
        """
        训练LSTM模型并返回预测结果
        """
        try:
            # 确保数据按时间戳排序
            data = data.sort_index()
            
            # 数据标准化
            scaled_data = self.scaler.fit_transform(data.values.reshape(-1, 1))
            
            # 准备序列数据
            X, y = self.prepare_sequences(scaled_data, seq_length)
            
            # 重塑数据以适应LSTM输入格式 (samples, time steps, features)
            X = X.reshape((X.shape[0], X.shape[1], 1))
            
            # 划分训练集和测试集
            train_size = int(len(X) * train_split)
            X_train, X_test = X[:train_size], X[train_size:]
            y_train, y_test = y[:train_size], y[train_size:]
            
            # 保存对应的时间戳
            self.timestamps = data.index[seq_length:].values  # 保存所有时间戳
            self.train_timestamps = self.timestamps[:train_size]
            self.test_timestamps = self.timestamps[train_size:]
            
            # 构建模型
            self.model = Sequential([
                LSTM(50, activation='relu', input_shape=(seq_length, 1), return_sequences=True),
                LSTM(50, activation='relu'),
                Dense(25, activation='relu'),
                Dense(1)
            ])
            
            self.model.compile(optimizer='adam', loss='mse')
            
            # 训练模型
            self.model.fit(
                X_train, y_train,
                epochs=epochs,
                batch_size=batch_size,
                validation_split=0.1,
                verbose=1
            )
            
            # 预测
            train_pred = self.model.predict(X_train)
            test_pred = self.model.predict(X_test)
            
            # 反标准化
            train_pred = self.scaler.inverse_transform(train_pred)
            test_pred = self.scaler.inverse_transform(test_pred)
            y_train_orig = self.scaler.inverse_transform(y_train.reshape(-1, 1))
            y_test_orig = self.scaler.inverse_transform(y_test.reshape(-1, 1))
            
            return {
                'train_pred': train_pred,
                'test_pred': test_pred,
                'y_train': y_train_orig,
                'y_test': y_test_orig,
                'train_timestamps': self.train_timestamps,
                'test_timestamps': self.test_timestamps
            }
            
        except Exception as e:
            print(f"训练过程出错: {str(e)}")
            raise e
    
    def evaluate_model(self, y_true, y_pred):
        """评估模型性能"""
        mse = mean_squared_error(y_true, y_pred)
        mae = mean_absolute_error(y_true, y_pred)
        rmse = np.sqrt(mse)
        
        return {
            'MSE': float(mse),
            'MAE': float(mae),
            'RMSE': float(rmse)
        }
    
    def predict_future(self, data, steps=24):
        """预测未来数据"""
        if self.model is None:
            raise ValueError("模型尚未训练")
            
        last_sequence = data[-self.seq_length:].values.reshape(1, -1, 1)
        predictions = []
        
        for _ in range(steps):
            next_pred = self.model.predict(last_sequence)
            predictions.append(next_pred[0, 0])
            last_sequence = np.roll(last_sequence, -1)
            last_sequence[0, -1, 0] = next_pred
            
        return self.scaler.inverse_transform(np.array(predictions).reshape(-1, 1)) 