// Shared search worker (copied verbatim from index.html #wk).
// ===== secp256k1 + Pollard kangaroo (parallel herds, batched inversion) =====
const P=(1n<<256n)-(1n<<32n)-977n, N=0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141n;
const G=[0x79BE667EF9DCBBAC55A06295CE870B07029BFCDB2DCE28D959F2815B16F81798n,0x483ADA7726A3C4655DA4FBFC0E1108A8FD17B448A68554199C47D08FFB10D4B8n];
const mod=(a,m=P)=>{a%=m;return a<0n?a+m:a};
function inv(a,m=P){let g=mod(a,m),x=1n,g1=m,x1=0n;while(g1){const q=g/g1;[g,g1]=[g1,g-q*g1];[x,x1]=[x1,x-q*x1];}return mod(x,m)}
function add(a,b){if(!a)return b;if(!b)return a;let l;
 if(a[0]===b[0]){if(mod(a[1]+b[1])===0n)return null;l=mod(3n*a[0]*a[0]*inv(2n*a[1]));}
 else l=mod((b[1]-a[1])*inv(b[0]-a[0]));
 const x=mod(l*l-a[0]-b[0]);return [x,mod(l*(a[0]-x)-a[1])];}
function mul(k,p){let r=null,q=p;k=mod(k,N);while(k>0n){if(k&1n)r=add(r,q);q=add(q,q);k>>=1n;}return r}
const hex=(n,w=64)=>n.toString(16).padStart(w,'0');
const comp=p=>((p[1]&1n)?'03':'02')+hex(p[0]);
function rnd(bits){const bytes=new Uint8Array(Math.ceil(bits/8));crypto.getRandomValues(bytes);let v=0n;for(const b of bytes)v=(v<<8n)|BigInt(b);return v&((1n<<BigInt(bits))-1n);}

function kangaroo(pub,start,bits,report){
 const range=1n<<BigInt(bits);
 const K=bits<=24?8:64;                                   // kangaroos per herd
 const mid=start+(range>>1n);
 // jump table: powers of two, mean ≈ m·sqrt(range)/4 for m parallel kangaroos (van Oorschot–Wiener)
 const target=2*K*Math.pow(2,bits/2)/4;let M=1;
 while((Math.pow(2,M+1)-1)/(M+1)<target&&M<60)M++;
 const nJ=M+1;const jumps=[],jumpP=[];
 for(let i=0;i<nJ;i++){const j=1n<<BigInt(i);jumps.push(j);jumpP.push(mul(j,G));}
 const dpBits=Math.max(0,Math.floor(bits/2)-9);const dpMask=(1n<<BigInt(dpBits))-1n;
 const spreadBits=Math.max(1,M-2);                        // start offsets: random, smaller than the mean jump
 const tame=[],wild=[];
 const seedT=i=>{const d=mid+rnd(spreadBits);return {p:mul(d,G),d};};
 const seedW=i=>{const d=rnd(spreadBits);return {p:add(pub,mul(d,G)),d};};
 for(let i=0;i<K;i++){tame.push(seedT(i));wild.push(seedW(i));}
 const tMap=new Map(),wMap=new Map();
 let hops=0,t0=Date.now(),last=t0;
 const expected=Math.pow(2,bits/2+1);
 // stage feed: real positions of the first 24 agents in each herd (tame: offset from range start; wild: distance from the unknown key)
 const S=Math.min(K,24);const mj=Number(jumps.reduce((a,b)=>a+b,0n)/BigInt(nJ));let nd=[];
 const snap=()=>({hops,ms:Date.now()-t0,expected,mj,t:tame.slice(0,S).map(o=>Number(o.d-start)),w:wild.slice(0,S).map(o=>Number(o.d)),nd:nd.splice(0),dps:tMap.size+wMap.size,x:hex(tame[0].p[0]).slice(0,16)});
 report(snap());
 function stepHerd(h,J){ // batched add of jump points
  const d=new Array(K),pre=new Array(K);let acc=1n;
  for(let i=0;i<K;i++){const jp=J[i];const p=h[i].p;let dd=mod(jp[0]-p[0]);if(dd===0n)dd=1n;d[i]=dd;pre[i]=acc;acc=mod(acc*dd);}
  let ia=inv(acc);
  for(let i=K-1;i>=0;i--){const di=mod(ia*pre[i]);ia=mod(ia*d[i]);const p=h[i].p,jp=J[i];
   if(p[0]===jp[0]){h[i].p=add(p,jp);continue;} // rare: fall back
   const l=mod((jp[1]-p[1])*di);const x=mod(l*l-p[0]-jp[0]);h[i].p=[x,mod(l*(p[0]-x)-p[1])];}
 }
 while(true){
  const JT=new Array(K),JW=new Array(K);
  for(let i=0;i<K;i++){const it=Number(tame[i].p[0]%BigInt(nJ)),iw=Number(wild[i].p[0]%BigInt(nJ));JT[i]=jumpP[it];tame[i].d+=jumps[it];JW[i]=jumpP[iw];wild[i].d+=jumps[iw];}
  stepHerd(tame,JT);stepHerd(wild,JW);hops+=2*K;
  for(let i=0;i<K;i++){
   const tp=tame[i].p,wp=wild[i].p;
   if((tp[0]&dpMask)===0n){const k=hex(tp[0]);if(tMap.has(k)){if(tMap.get(k)!==tame[i].d)tame[i]=seedT(i);}else{tMap.set(k,tame[i].d);nd.push(['t',Number(tame[i].d-start)]);if(wMap.has(k)){const key=mod(tame[i].d-wMap.get(k),N);if(check(key))return {key,hops,ms:Date.now()-t0,meetT:Number(tame[i].d-start),meetW:Number(wMap.get(k)),mj};}}}
   if((wp[0]&dpMask)===0n){const k=hex(wp[0]);if(wMap.has(k)){if(wMap.get(k)!==wild[i].d)wild[i]=seedW(i);}else{wMap.set(k,wild[i].d);nd.push(['w',Number(wild[i].d)]);if(tMap.has(k)){const key=mod(tMap.get(k)-wild[i].d,N);if(check(key))return {key,hops,ms:Date.now()-t0,meetT:Number(tMap.get(k)-start),meetW:Number(wild[i].d),mj};}}}
  }
  const now=Date.now();if(now-last>90){last=now;report(snap());}
 }
 function check(k){const q=mul(k,G);return q&&q[0]===pub[0]&&q[1]===pub[1];}
}
self.onmessage=e=>{
 const {bits,id}=e.data;
 const start=1n<<BigInt(bits-1);
 const key=start+rnd(bits-1);
 const pub=mul(key,G);
 self.postMessage({id,type:'commit',bits,pub:comp(pub),start:hex(start,1)});
 const res=kangaroo(pub,start,bits,r=>self.postMessage({id,type:'progress',...r}));
 const ok=comp(mul(res.key,G))===comp(pub);
 self.postMessage({id,type:'done',bits,pub:comp(pub),key:hex(res.key),hops:res.hops,ms:res.ms,ok,meetT:res.meetT,meetW:res.meetW,keyOff:Number(res.key-start),mj:res.mj,range:Number(1n<<BigInt(bits-1))});
};
