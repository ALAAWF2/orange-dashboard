import json
import sys

sys.stdout.reconfigure(encoding='utf-8')

try:
    with open('employees_data.json', 'r', encoding='utf-8') as f:
        data = json.load(f)

    # find where value contains '4122'
    results = []
    def find_4122(obj, path=""):
        if isinstance(obj, dict):
            for k, v in obj.items():
                if '4122' in str(v):
                    results.append((path + f"[{k}]", obj))
                find_4122(v, path + f"[{k}]")
        elif isinstance(obj, list):
            for i, v in enumerate(obj):
                if '4122' in str(v):
                    results.append((path + f"[{i}]", v))
                find_4122(v, path + f"[{i}]")

    find_4122(data)
    
    # print unique dict results to avoid spam
    seen = []
    for p, obj in results:
        if isinstance(obj, dict) and obj not in seen:
            print(f"Path: {p} => {obj}")
            seen.append(obj)
            if len(seen) > 3: break
    if not results:
        print("4122 not found")
except Exception as e:
    print("Error:", e)
