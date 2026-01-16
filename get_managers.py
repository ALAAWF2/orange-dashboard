import json
import os

file_path = r'C:\Users\ALAA-ORANGE\Desktop\orangedata\allorangedashboard\management_data.json'
output_path = r'C:\Users\ALAA-ORANGE\Desktop\orangedata\allorangedashboard\managers_list.txt'

try:
    with open(file_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
        
    store_meta = data.get('store_meta', {})
    managers = set()
    
    for store_id, meta in store_meta.items():
        manager = meta.get('manager')
        if manager and manager.lower() != 'unknown' and manager.lower() != 'online':
             managers.add(manager)
             
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write("Found Managers:\n")
        for m in sorted(list(managers)):
            f.write(f"- {m}\n")
            
    print(f"Managers list saved to {output_path}")
        
except Exception as e:
    print(f"Error: {e}")
