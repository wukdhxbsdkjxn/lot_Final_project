import pandas as pd
import numpy as np
from statsmodels.tsa.arima.model import ARIMA
from statsmodels.tsa.stattools import adfuller
from typing import Tuple, Dict
import warnings
warnings.filterwarnings('ignore')

class WeatherARIMA:
    def __init__(self):
        self.model = None
        self.model_fit = None
        
    def check_stationarity(self, data: pd.Series) -> Dict:
        """检查时间序列的平稳性"""
        result = adfuller(data)
        return {
            'Test Statistic': result[0],
            'p-value': result[1],
            'Critical Values': result[4]
        }
    
    def find_best_parameters(self, data: pd.Series, max_p=3, max_d=2, max_q=3) -> Tuple[int, int, int]:
        """寻找最佳ARIMA参数"""
        best_aic = float('inf')
        best_params = None
        
        for p in range(max_p + 1):
            for d in range(max_d + 1):
                for q in range(max_q + 1):
                    try:
                        model = ARIMA(data, order=(p, d, q))
                        results = model.fit()
                        if results.aic < best_aic:
                            best_aic = results.aic
                            best_params = (p, d, q)
                    except:
                        continue
        
        return best_params
    
    def train(self, data: pd.Series, order: Tuple[int, int, int] = None):
        """训练ARIMA模型"""
        if order is None:
            order = self.find_best_parameters(data)
            
        self.model = ARIMA(data, order=order)
        self.model_fit = self.model.fit()
        return self.model_fit
    
    def predict(self, steps: int) -> pd.Series:
        """进行预测"""
        if self.model_fit is None:
            raise ValueError("Model has not been trained yet")
        
        forecast = self.model_fit.forecast(steps=steps)
        return forecast 