// Verification only: Cesium re-normalizes unit orientation vectors during
// camera updates. Position must remain bit-for-bit identical; orientation may
// differ by at most 16 machine epsilons per component (3.56e-15).
export function sameCameraPose(actual, expected) {
  if (!Array.isArray(actual) || !Array.isArray(expected) || actual.length!==4 || expected.length!==4) return false
  return actual.every((vector,index)=>['x','y','z'].every(key=>{
    const a=vector?.[key], b=expected[index]?.[key]
    return Number.isFinite(a) && Number.isFinite(b)
      && (index===0 ? a===b : Math.abs(a-b)<=16*Number.EPSILON)
  }))
}
