import paho.mqtt.client as mqtt
import json
import tkinter as tk
from tkinter import ttk
import matplotlib.pyplot as plt
from matplotlib.backends.backend_tkagg import FigureCanvasTkAgg
import threading
from tkinter import messagebox
from collections import deque
import time

class SubscriberGUI:
    def __init__(self):
        self.root = tk.Tk()
        self.root.title("MQTT数据订阅器")
        self.root.geometry("1000x800")
        
        self.subscriber = SimpleSubscriber(self.update_data)
        self.data_queue = deque(maxlen=50)  # 存储最近50条数据
        self.setup_gui()
        
    def setup_gui(self):
        # 连接设置框架
        conn_frame = ttk.LabelFrame(self.root, text="连接设置", padding="5")
        conn_frame.pack(fill="x", padx=5, pady=5)
        
        ttk.Label(conn_frame, text="Broker地址:").grid(row=0, column=0)
        self.broker_entry = ttk.Entry(conn_frame)
        self.broker_entry.insert(0, "localhost")
        self.broker_entry.grid(row=0, column=1)
        
        ttk.Label(conn_frame, text="端口:").grid(row=0, column=2)
        self.port_entry = ttk.Entry(conn_frame, width=10)
        self.port_entry.insert(0, "1883")
        self.port_entry.grid(row=0, column=3)
        
        self.connect_btn = ttk.Button(conn_frame, text="连接", command=self.connect)
        self.connect_btn.grid(row=0, column=4, padx=5)
        
        # 数据显示区域
        display_frame = ttk.LabelFrame(self.root, text="数据显示", padding="5")
        display_frame.pack(fill="both", expand=True, padx=5, pady=5)
        
        # 创建图表
        self.fig, (self.ax1, self.ax2) = plt.subplots(2, 1, figsize=(10, 6))
        self.canvas = FigureCanvasTkAgg(self.fig, master=display_frame)
        self.canvas.draw()
        self.canvas.get_tk_widget().pack(fill="both", expand=True)
        
        # 原始数据显示
        self.data_text = tk.Text(self.root, height=10)
        self.data_text.pack(fill="x", padx=5, pady=5)
        
    def connect(self):
        try:
            host = self.broker_entry.get()
            port = int(self.port_entry.get())
            threading.Thread(target=self.subscriber.connect, 
                           args=(host, port), 
                           daemon=True).start()
            self.connect_btn.config(state="disabled")
        except Exception as e:
            messagebox.showerror("错误", f"连接失败: {str(e)}")
    
    def update_data(self, data):
        self.data_queue.append(data)
        self.data_text.insert("end", f"收到数据: {data}\n")
        self.data_text.see("end")
        self.update_plots()
    
    def update_plots(self):
        self.ax1.clear()
        self.ax2.clear()
        
        times = [d['time'] for d in self.data_queue]
        temps = [d['temperature'] for d in self.data_queue]
        humids = [d['humidity'] for d in self.data_queue]
        
        self.ax1.plot(times, temps, 'r-', label='温度')
        self.ax1.set_ylabel('温度 (°C)')
        self.ax1.legend()
        self.ax1.tick_params(axis='x', rotation=45)
        
        self.ax2.plot(times, humids, 'b-', label='湿度')
        self.ax2.set_ylabel('湿度 (%)')
        self.ax2.legend()
        self.ax2.tick_params(axis='x', rotation=45)
        
        plt.tight_layout()
        self.canvas.draw()
    
    def run(self):
        self.root.mainloop()

class SimpleSubscriber:
    def __init__(self, callback):
        self.client = mqtt.Client()
        self.client.on_connect = self.on_connect
        self.client.on_message = self.on_message
        self.callback = callback

    def on_connect(self, client, userdata, flags, rc):
        if rc == 0:
            print("Connected to MQTT Broker!")
            self.client.subscribe("sensor/data")
        else:
            print(f"Failed to connect, return code {rc}")

    def on_message(self, client, userdata, msg):
        try:
            data = json.loads(msg.payload.decode())
            self.callback(data)
        except Exception as e:
            print(f"Error processing message: {e}")

    def connect(self, host="localhost", port=1883):
        try:
            self.client.connect(host, port)
            self.client.loop_forever()
        except Exception as e:
            print(f"Connection error: {e}")

if __name__ == '__main__':
    gui = SubscriberGUI()
    gui.run()