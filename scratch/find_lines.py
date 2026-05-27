import re

file_path = r"C:\Users\ALAA-ORANGE\Desktop\orangedata\allorangedashboard\index.html"
with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
    lines = f.readlines()

for i, line in enumerate(lines):
    if "btnSetTarget" in line or "currentUser" in line:
        print(f"{i+1}: {line.strip()}")
