import { useEffect, useRef } from 'react'
import { SkinViewer } from 'skinview3d'

interface Props {
  skinUrl: string | null
  variant: 'CLASSIC' | 'SLIM'
  capeUrl?: string | null
  width?: number
  height?: number
}

// Replaces the old flat, front-only CSS "paper doll" crop with a real 3D
// render - skinview3d already draws both skin layers (base + the overlay
// layer used for hats/jackets/sleeves, invisible on the old CSS version
// since that only ever cropped the base-layer UV regions) and a worn cape,
// and ships mouse-drag rotation via OrbitControls (`enableControls`,
// defaulted true) with no extra code needed on this end.
function SkinViewer3D({ skinUrl, variant, capeUrl, width = 140, height = 280 }: Props): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const viewerRef = useRef<SkinViewer | null>(null)

  useEffect(() => {
    if (!canvasRef.current) return
    const viewer = new SkinViewer({
      canvas: canvasRef.current,
      width,
      height,
      zoom: 0.75
    })
    viewerRef.current = viewer
    return () => {
      viewer.dispose()
      viewerRef.current = null
    }
    // Intentionally only recreated when the canvas element itself remounts -
    // skin/cape/variant/size updates below are applied to the existing
    // instance instead of tearing down and rebuilding the whole scene.
  }, [])

  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewer) return
    if (skinUrl) {
      void viewer.loadSkin(skinUrl, { model: variant === 'SLIM' ? 'slim' : 'default' })
    } else {
      viewer.loadSkin(null)
    }
  }, [skinUrl, variant])

  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewer) return
    if (capeUrl) {
      void viewer.loadCape(capeUrl)
    } else {
      viewer.loadCape(null)
    }
  }, [capeUrl])

  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewer) return
    viewer.width = width
    viewer.height = height
  }, [width, height])

  return <canvas ref={canvasRef} className="skin-viewer-3d-canvas" />
}

export default SkinViewer3D
