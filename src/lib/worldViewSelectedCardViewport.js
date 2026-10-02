// DISPLAY-only inset receipt for the selected reader. These measured controls
// never change the admission rectangle or canonical anchors of world markers.
export function selectedCardInsetsForControls({viewport,canvasBounds,controlBounds=[]}={}) {
  if (!viewport || viewport.height<=0 || viewport.width<400 || viewport.width<=viewport.height || viewport.height>=480
    || ![viewport.width,viewport.height,canvasBounds?.left,canvasBounds?.top,canvasBounds?.width,canvasBounds?.height].every(Number.isFinite)
    || canvasBounds.width<=0 || canvasBounds.height<=0) return null
  const scaleX=viewport.width/canvasBounds.width,scaleY=viewport.height/canvasBounds.height
  const top=8,bottom=viewport.height-44,gap=8
  let left=16,right=40
  for(const bounds of controlBounds){
    if(![bounds?.left,bounds?.top,bounds?.width,bounds?.height].every(Number.isFinite)||bounds.width<=0||bounds.height<=0)continue
    const x=(bounds.left-canvasBounds.left)*scaleX,y=(bounds.top-canvasBounds.top)*scaleY
    const x2=x+bounds.width*scaleX,y2=y+bounds.height*scaleY
    if(![x,y,x2,y2].every(Number.isFinite))continue
    // Dock actions are outside the canvas. Its Page strip is in the toolbar,
    // above this reader band; neither consumes the map's free column.
    if(y2<=top||y>=bottom||x2<=0||x>=viewport.width)continue
    if((x+x2)/2<viewport.width/2)left=Math.max(left,Math.min(viewport.width,x2+gap))
    else right=Math.max(right,Math.min(viewport.width,viewport.width-x+gap))
  }
  return {left,right}
}
