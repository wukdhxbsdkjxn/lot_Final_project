import paho.mqtt.client as mqtt
import time
import json
import tkinter as tk
from tkinter import ttk, filedialog
import pandas as pd
from tkinter import messagebox
import threading

class PublisherGUI:
    def __init__(self):
        self.root = tk.Tk()
        self.root.title("MQTT数据发布器")
        self.root.geometry("800x600")
        
        self.publisher = SimplePublisher()
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
        
        # 数据文件设置
        file_frame = ttk.LabelFrame(self.root, text="数据文件", padding="5")
        file_frame.pack(fill="x", padx=5, pady=5)
        
        self.file_path = ttk.Entry(file_frame, width=50)
        self.file_path.grid(row=0, column=0, padx=5)
        
        ttk.Button(file_frame, text="选择文件", command=self.select_file).grid(row=0, column=1)
        
        # 发布控制
        control_frame = ttk.LabelFrame(self.root, text="发布控制", padding="5")
        control_frame.pack(fill="x", padx=5, pady=5)
        
        self.start_btn = ttk.Button(control_frame, text="开始发布", command=self.start_publishing)
        self.start_btn.pack(side="left", padx=5)
        
        self.stop_btn = ttk.Button(control_frame, text="停止发布", command=self.stop_publishing, state="disabled")
        self.stop_btn.pack(side="left", padx=5)
        
        # 状态显示
        self.status_text = tk.Text(self.root, height=20)
        self.status_text.pack(fill="both", expand=True, padx=5, pady=5)
        
        self.publishing = False
        
    def select_file(self):
        filename = filedialog.askopenfilename(
            filetypes=[("Text files", "*.txt"), ("All files", "*.*")]
        )
        if filename:
            self.file_path.delete(0, tk.END)
            self.file_path.insert(0, filename)
    
    def connect(self):
        try:
            host = self.broker_entry.get()
            port = int(self.port_entry.get())
            self.publisher.connect(host, port)
            messagebox.showinfo("成功", "已连接到MQTT Broker!")
        except Exception as e:
            messagebox.showerror("错误", f"连接失败: {str(e)}")
    
    def start_publishing(self):
        if not self.file_path.get():
            messagebox.showerror("错误", "请先选择数据文件")
            return
            
        self.publishing = True
        self.start_btn.config(state="disabled")
        self.stop_btn.config(state="normal")
        
        # 在新线程中启动发布
        threading.Thread(target=self.publish_data, daemon=True).start()
    
    def stop_publishing(self):
        self.publishing = False
        self.start_btn.config(state="normal")
        self.stop_btn.config(state="disabled")
    
    def publish_data(self):
        try:
            with open(self.file_path.get(), 'r') as file:
                data_lines = file.readlines()
                while self.publishing:
                    for line in data_lines:
                        if not self.publishing:
                            break
                        # 解析每行数据（格式：温度,湿度）
                        try:
                            temp, humid = map(float, line.strip().split(','))
                            message = {
                                "temperature": temp,
                                "humidity": humid,
                                "time": time.strftime("%Y-%m-%d %H:%M:%S")
                            }
                            self.publisher.publish_message(message)
                            self.status_text.insert("end", f"已发布: {message}\n")
                            self.status_text.see("end")
                            time.sleep(2)
                        except ValueError as e:
                            self.status_text.insert("end", f"跳过无效数据行: {line}\n")
                            continue
        except Exception as e:
            messagebox.showerror("错误", f"发布数据时出错: {str(e)}")
            self.stop_publishing()
    
    def run(self):
        self.root.mainloop()

class SimplePublisher:
    def __init__(self):
        self.client = mqtt.Client()
        self.client.on_connect = self.on_connect
        self.client.on_publish = self.on_publish

    def on_connect(self, client, userdata, flags, rc):
        if rc == 0:
            print("Connected to MQTT Broker!")
        else:
            raise Exception(f"Failed to connect, return code {rc}")

    def on_publish(self, client, userdata, mid):
        print(f"Message Published. Message ID: {mid}")

    def connect(self, host="localhost", port=1883):
        self.client.connect(host, port)
        self.client.loop_start()

    def publish_message(self, message):
        result = self.client.publish("sensor/data", json.dumps(message))
        if result[0] != 0:
            raise Exception("Failed to send message")

if __name__ == '__main__':
    gui = PublisherGUI()
    gui.run()