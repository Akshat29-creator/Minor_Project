import requests
import json

url = "http://localhost:8000/api/detect"
try:
    files = {'file': open(r"dataset\UATD_Test_2\UATD_Test_2\images\00010.bmp", 'rb')}
    r = requests.post(url, files=files)
    print(f"Status Code: {r.status_code}")
    if r.status_code == 500:
        print("Response Text:", r.text)
    else:
        print("Success!")
except Exception as e:
    print("Error connecting:", e)
