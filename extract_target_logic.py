import sys

sys.stdout.reconfigure(encoding='utf-8')

with open('c:/Users/ALAA-ORANGE/Desktop/orangedata/allorangedashboard/employees.html', 'r', encoding='utf-8') as f:
    lines = f.readlines()

for i, line in enumerate(lines):
    if 'target' in line.lower() or '4000' in line or 'eid' in line.lower() or 'ramadan' in line.lower():
        print(f"Line {i+1}: {line.strip()}")
