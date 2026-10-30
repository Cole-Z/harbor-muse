# Generates the six illustrative type placeholders (original artwork, CC0). Run: python3 tools/make-ship-photos.py
from PIL import Image, ImageDraw, ImageFilter
W,H=640,240
def base(sky,sea):
    im=Image.new('RGB',(W,H),sky);d=ImageDraw.Draw(im)
    for y in range(H):
        t=y/H;d.line([(0,y),(W,y)],fill=tuple(int(sky[i]*(1-t)+255*t*0.3) for i in range(3)))
    d.rectangle([0,150,W,H],fill=sea)
    for i in range(0,W,40): d.arc([i,160+(i%3)*12,i+30,175+(i%3)*12],200,340,fill=(255,255,255),width=2)
    return im,d
def hull(d,x0,x1,top,col):d.polygon([(x0,top),(x1,top),(x1-30,165),(x0+15,165)],fill=col)
def cargo(d):
    hull(d,120,540,120,(40,60,90))
    cs=[(200,60,50),(40,120,180),(230,170,40),(60,140,80)]
    for i,x in enumerate(range(150,470,36)):
        for j in range(3):d.rectangle([x,96-j*22,x+32,118-j*22],fill=cs[(i+j)%4])
    d.rectangle([480,70,520,120],fill=(235,235,235))
def tanker(d):
    hull(d,100,560,125,(150,30,30));d.rectangle([110,112,540,125],fill=(70,70,70))
    for x in range(160,440,70):d.ellipse([x,100,x+50,118],fill=(200,200,200))
    d.rectangle([470,70,525,112],fill=(240,240,240))
def tug(d):
    hull(d,230,430,125,(30,30,30));d.rectangle([280,85,370,125],fill=(230,80,40));d.rectangle([300,60,350,85],fill=(245,245,245))
    for x in range(240,420,25):d.ellipse([x,128,x+18,146],fill=(40,30,20))
def passenger(d):
    hull(d,90,570,120,(245,245,245))
    for k,(a,b) in enumerate([(130,520),(160,500),(200,470)]):
        y=120-(k+1)*20;d.rectangle([a,y,b,y+20],fill=(250,250,250),outline=(180,180,190))
        for x in range(a+8,b-8,18):d.rectangle([x,y+6,x+10,y+13],fill=(40,90,150))
    d.rectangle([380,40,410,60],fill=(200,40,40))
def fishing(d):
    hull(d,200,460,125,(30,90,140));d.rectangle([370,80,430,125],fill=(240,240,240))
    d.line([(260,125),(260,45)],fill=(60,60,60),width=4);d.line([(260,50),(200,125)],fill=(60,60,60),width=2);d.line([(260,50),(330,125)],fill=(60,60,60),width=2)
def unknown(d):
    hull(d,200,460,125,(90,100,110));d.rectangle([330,90,400,125],fill=(220,220,220));d.line([(300,125),(300,60)],fill=(60,60,60),width=3)
for name,f,sky,sea in [('cargo',cargo,(150,190,225),(40,90,140)),('tanker',tanker,(170,200,230),(35,85,130)),('tug',tug,(160,195,220),(45,95,135)),('passenger',passenger,(140,185,230),(30,100,150)),('fishing',fishing,(190,205,215),(50,90,120)),('unknown',unknown,(170,190,210),(45,85,120))]:
    im,d=base(sky,sea);f(d);im.filter(ImageFilter.SMOOTH).save(f'public/assets/ship-photos/{name}.webp','WEBP',quality=70)
