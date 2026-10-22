# Makes every Patas icon from the transparent logo (Windows, no extra tools: System.Drawing).
#   powershell -File scripts/make-icons-from-logo.ps1 [-Source assets/brand/patas-logo.png]
# Transparent: public/icon-192.png, icon-512.png, assets/favicon.png.
# Solid light background (both platforms need it): apple-touch-icon.png (iPhone paints transparency black) and
# icon-maskable-512.png (Android fills the whole square; the logo stays inside the middle 72% so round or
# squircle masks never cut it). The logo itself comes from scripts/remove-background.ps1.
param([string]$Source = "assets/brand/patas-logo.png")
Add-Type -AssemblyName System.Drawing
$here = Split-Path -Parent $PSScriptRoot
$src = [System.Drawing.Bitmap]::FromFile((Resolve-Path (Join-Path $here $Source)))
$light = [System.Drawing.Color]::FromArgb(255, 0xFA, 0xFB, 0xFE) # the logo's own near-white

function Save-Icon([int]$size, [double]$scale, [string]$out, [bool]$solid) {
  $bmp = New-Object System.Drawing.Bitmap $size, $size, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
  if ($solid) { $g.Clear($light) } else { $g.Clear([System.Drawing.Color]::Transparent) }
  $w = [int][Math]::Round($size * $scale)
  $o = [int][Math]::Round(($size - $w) / 2)
  $g.DrawImage($src, $o, $o, $w, $w)
  $g.Dispose()
  $path = Join-Path $here $out
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  "{0,-28} {1}x{1}  {2,-11} {3:N0} bytes" -f $out, $size, ($(if ($solid) { 'solid' } else { 'transparent' })), (Get-Item $path).Length
}

Save-Icon 512 1.0 "public/icon-512.png" $false
Save-Icon 192 1.0 "public/icon-192.png" $false
Save-Icon 48 1.0 "assets/favicon.png" $false
Save-Icon 180 0.92 "public/apple-touch-icon.png" $true
Save-Icon 512 0.72 "public/icon-maskable-512.png" $true
$src.Dispose()
