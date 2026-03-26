import json
import sys
import glob

sys.stdout.reconfigure(encoding='utf-8')

for json_file in glob.glob('*.json'):
    try:
        with open(json_file, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        # simple depth search for ID 4122
        def search(obj):
            if isinstance(obj, dict):
                if str(obj.get('Employee ID')) == '4122' or str(obj.get('emp_id')) == '4122' or '4122 ' in str(obj.get('Employee Name')):
                    print(f"Found in {json_file}: {obj}")
                for v in obj.values():
                    search(v)
            elif isinstance(obj, list):
                for v in obj:
                    search(v)
        
        search(data)
    except Exception as e:
        print(f"Error reading {json_file}: {e}")
