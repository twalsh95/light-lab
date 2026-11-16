import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter, map_coordinates, shift as ndshift

N=900
xs=np.linspace(-1.5,1.5,N); ys=np.linspace(1.3,-1.7,N)
X,Y=np.meshgrid(xs,ys)

def ell(cx,cy,rx,ry,rz):
    v=1-((X-cx)/rx)**2-((Y-cy)/ry)**2
    return np.where(v>0,rz*np.sqrt(np.clip(v,0,None)),0)
H=ell(0,0.15,0.62,0.82,0.62)                       # head
H=np.maximum(H,ell(0,-0.78,0.17,0.3,0.2))           # neck
H=np.maximum(H,ell(0,-1.45,1.35,0.6,0.55))          # shoulders
g=lambda cx,cy,sx,sy:np.exp(-(((X-cx)/sx)**2+((Y-cy)/sy)**2))
mask=H>0.005
H=H+0.16*g(0,0.05,0.09,0.16)*(ell(0,0.15,0.62,0.82,0.62)>0)   # nose
H=H-0.05*g(-0.24,0.22,0.1,0.05)-0.05*g(0.24,0.22,0.1,0.05)    # eye sockets
H=H+0.04*g(0,0.62,0.4,0.07)                                    # brow
H=H+0.05*g(0,-0.45,0.17,0.1)                                   # chin
H=gaussian_filter(H,2.0)
dy,dx=np.gradient(H,ys[1]-ys[0],xs[1]-xs[0])
nz=1/np.sqrt(1+dx**2+dy**2); nx=-dx*nz; ny=-dy*nz
# rim detection: silhouette edges
def unit(a):
    a=np.array(a,float); return a/np.linalg.norm(a)
def lam(l,wrap=0.0):
    l=unit(l); d=nx*l[0]+ny*l[1]+nz*l[2]
    return np.clip((d+wrap)/(1+wrap),0,1)
def shadow(l,length=1.2,steps=70):
    l=unit(l)
    out=np.ones_like(H)
    px=(X-xs[0])/(xs[1]-xs[0]); py=(ys[0]-Y)/(ys[0]-ys[1])
    for s in np.linspace(0.02,length,steps):
        sx=px+ (l[0]/max(l[2],0.2))*s/(xs[1]-xs[0])
        sy=py - (l[1]/max(l[2],0.2))*s/(ys[0]-ys[1])
        h=map_coordinates(H,[sy,sx],order=1,mode='constant',cval=0)
        out=np.where(h>H+s*0.9,0.0,out)   # blocked
    return out
def render(bg, ambient, lights, wall_shadow=None, name='x', tint=(1.0,0.97,0.93), vignette=0.0, bgtint=None):
    img=np.zeros_like(H)+ambient
    for L in lights:
        d=lam(L['dir'],L.get('wrap',0.0))**L.get('pow',1.0)
        if L.get('shadow',False):
            sh=gaussian_filter(shadow(L['dir']),L.get('soft',6))
            d=d*(0.25+0.75*sh) if L.get('shadow_mix') is None else d*(1-L['shadow_mix']*(1-sh))
        img=img+L['i']*d
    skin=0.74
    face=np.clip(img*skin,0,1)
    # background with optional soft light falloff and a head shadow on the wall
    B=np.zeros_like(H)+bg
    if wall_shadow:
        sdx,sdy,amt,blur=wall_shadow
        m=ndshift(mask.astype(float),(sdy,sdx),order=1)
        m=gaussian_filter(m,blur)
        B=B*(1-amt*m)
    soft=gaussian_filter(mask.astype(float),1.2)
    out=B*(1-soft)+face*soft
    out=np.clip(out,0,1)
    if vignette:
        r=np.sqrt(X**2+Y**2); out=out*(1-vignette*np.clip(r-0.6,0,1)**1.5)
    rgb=np.stack([out*tint[0],out*tint[1],out*tint[2]],-1)
    rgb=np.clip(rgb,0,1)**(1/1.0)
    Image.fromarray((rgb*255).astype(np.uint8)).save(f'{name}.jpg',quality=92)
    print(name, round(float(face[mask].mean()),2), round(float(B.mean()),2))

KEY=(-0.75,0.55,0.9)     # camera-left, up, toward camera
FILL=(0.8,0.1,1.0)
BACK=(0.75,0.45,-0.5)

# 1 key only
render(0.30,0.04,[dict(dir=KEY,i=1.0,wrap=0.15,shadow=True,soft=8,shadow_mix=0.85)],(60,10,0.55,26),'p1_key')
# 2 key + fill
render(0.30,0.06,[dict(dir=KEY,i=0.95,wrap=0.15,shadow=True,soft=8,shadow_mix=0.85),dict(dir=FILL,i=0.38,wrap=0.4)],(60,10,0.5,26),'p2_keyfill')
# 3 three point
render(0.30,0.06,[dict(dir=KEY,i=0.95,wrap=0.15,shadow=True,soft=8,shadow_mix=0.85),dict(dir=FILL,i=0.38,wrap=0.4),dict(dir=BACK,i=1.1,pow=2.5)],(60,10,0.5,26),'p3_three')
# 4 high key
render(0.96,0.28,[dict(dir=KEY,i=0.62,wrap=0.5,shadow=True,soft=14,shadow_mix=0.35),dict(dir=(0.7,0.2,1.0),i=0.55,wrap=0.6),dict(dir=(0,0.4,1.0),i=0.1,wrap=0.8)],(40,8,0.10,34),'p4_highkey')
# 5 low key
render(0.035,0.0,[dict(dir=(-1.0,0.25,0.35),i=1.15,wrap=0.0,shadow=True,soft=5,shadow_mix=0.9)],None,'p5_lowkey')
# 6 trap: dark backdrop, but balanced three-point
render(0.035,0.06,[dict(dir=KEY,i=0.95,wrap=0.15,shadow=True,soft=8,shadow_mix=0.85),dict(dir=FILL,i=0.5,wrap=0.4),dict(dir=BACK,i=1.1,pow=2.5)],None,'p6_trap')
# 7 bright backdrop but dramatic shadows (other trap): white bg + key only
render(0.95,0.02,[dict(dir=(-1.0,0.25,0.4),i=1.1,wrap=0.0,shadow=True,soft=5,shadow_mix=0.9)],None,'p7_whitebg_lowkey')
