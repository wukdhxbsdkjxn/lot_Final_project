import pandas as pd
import numpy as np
import json
from typing import Dict, Tuple

class WeatherDataProcessor:
    def __init__(self):
        self.data = {}
        
    def load_data(self, file_path: str) -> pd.Series:
        """加载并处理数据文件"""
        data_dict = {}
        with open(file_path, 'r', encoding='utf-8') as f:
            for line in f:
                if line.strip():
                    # 解析每行的JSON数据
                    try:
                        d = eval(line.strip())
                        data_dict.update(d)
                    except:
                        continue
        
        # 转换为时间序列数据
        series = pd.Series(data_dict)
        series.index = pd.to_datetime(series.index)
        series = series.sort_index()
        
        # 转换数据类型为float
        series = series.astype(float)
        
        # 处理缺失值
        series = series.interpolate()
        
        return series
    
    def split_data(self, data: pd.Series, train_ratio: float = 0.8) -> Tuple[pd.Series, pd.Series]:
        """将数据分割为训练集和测试集"""
        train_size = int(len(data) * train_ratio)
        train_data = data[:train_size]
        test_data = data[train_size:]
        return train_data, test_data
    
    def resample_data(self, data: pd.Series, freq: str = 'H') -> pd.Series:
        """重采样数据到指定频率"""
        return data.resample(freq).mean().interpolate() 