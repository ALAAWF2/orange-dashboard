
import requests
import base64
import os

font_url = "https://raw.githubusercontent.com/google/fonts/main/ofl/amiri/Amiri-Regular.ttf"

print(f"Downloading font from {font_url}...")
try:
    response = requests.get(font_url)
    response.raise_for_status()
    
    font_data = response.content
    base64_font = base64.b64encode(font_data).decode('utf-8')
    
    js_content = f"""// Amiri Regular Font Base64
const amiriFontBase64 = "{base64_font}";
"""
    
    output_path = "assets/amiri_font.js"
    os.makedirs("assets", exist_ok=True)
    
    with open(output_path, "w", encoding='utf-8') as f:
        f.write(js_content)
        
    print(f"Successfully created {output_path} (Size: {len(base64_font)} chars)")

except Exception as e:
    print(f"Error: {e}")
