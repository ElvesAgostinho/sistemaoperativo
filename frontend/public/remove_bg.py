import sys
from PIL import Image

def remove_background(input_path, output_path, tolerance=20):
    img = Image.open(input_path).convert("RGBA")
    data = img.getdata()
    
    # Get the background color from top-left pixel
    bg_color = data[0]
    
    new_data = []
    for item in data:
        # Check if color is close to bg_color
        if (abs(item[0] - bg_color[0]) <= tolerance and 
            abs(item[1] - bg_color[1]) <= tolerance and 
            abs(item[2] - bg_color[2]) <= tolerance):
            # Make it transparent
            new_data.append((255, 255, 255, 0))
        else:
            new_data.append(item)
            
    img.putdata(new_data)
    img.save(output_path, "PNG")
    print(f"Saved {output_path}")

if __name__ == "__main__":
    remove_background("logo.png", "logo-transparent.png")
