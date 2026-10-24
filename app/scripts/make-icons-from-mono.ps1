# Makes every Patas icon from the white glyph, Gastos-style: white figure on solid violet (Joe, 2026-10-23).
#   powershell -File scripts/make-icons-from-mono.ps1 [-Source assets/brand/patas-mono.png]
# The glyph is white on transparent, cropped square (keyed from Joe's ChatGPT drawing). Violet #5946E7 is the
# wallet colour of the full-colour logo; white on it is 6.1:1. Every icon is solid (no transparency), so iPhone
# never paints a black square and Android's round or squircle masks only ever cut violet.
param([string]$Source = "assets/brand/patas-mono.png")
Add-Type -AssemblyName System.Drawing
$here = Split-Path -Parent $PSScriptRoot
$src = [System.Drawing.Bitmap]::FromFile((Resolve-Path (Join-Path $here $Source)))
$violet = [System.Drawing.Color]::FromArgb(255, 0x59, 0x46, 0xE7)

# scale = the glyph's height as a share of the icon side.
function Save-Icon([int]$size, [double]$scale, [string]$out) {
  $bmp = New-Object System.Drawing.Bitmap $size, $size, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
  $g.Clear($violet)
  $w = [int][Math]::Round($size * $scale)
  $o = [int][Math]::Round(($size - $w) / 2)
  $g.DrawImage($src, $o, $o, $w, $w)
  $g.Dispose()
  $path = Join-Path $here $out
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  "{0,-28} {1}x{1}  glyph {2:P0}  {3:N0} bytes" -f $out, $size, $scale, (Get-Item $path).Length
}

Save-Icon 512 0.66 "public/icon-512.png"
Save-Icon 192 0.66 "public/icon-192.png"
Save-Icon 48 0.82 "assets/favicon.png"          # tiny: the glyph fills more so the face still reads
Save-Icon 180 0.66 "public/apple-touch-icon.png"
Save-Icon 512 0.58 "public/icon-maskable-512.png" # glyph corners stay inside Android's 80% safe circle
$src.Dispose()
