# Makes every Patas icon from the logo picture (Windows, no extra tools: System.Drawing).
#   powershell -File scripts/make-icons-from-logo.ps1 [-Source assets/brand/patas-logo.png]
# Writes public/icon-192.png, icon-512.png, icon-maskable-512.png, apple-touch-icon.png and assets/favicon.png.
# The maskable icon keeps the logo inside the middle 72% on the logo's own background, so Android's
# round or squircle masks never cut it.
param([string]$Source = "assets/brand/patas-logo.png")
Add-Type -AssemblyName System.Drawing
$here = Split-Path -Parent $PSScriptRoot
$src = [System.Drawing.Bitmap]::FromFile((Resolve-Path (Join-Path $here $Source)))
$bg = $src.GetPixel(2, 2)

function Save-Icon([int]$size, [double]$scale, [string]$out) {
  $bmp = New-Object System.Drawing.Bitmap $size, $size
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.Clear($bg)
  $w = [int][Math]::Round($size * $scale)
  $o = [int][Math]::Round(($size - $w) / 2)
  # Repeat the edge pixels while scaling, or the picture gets a faint grey frame on the background.
  $attr = New-Object System.Drawing.Imaging.ImageAttributes
  $attr.SetWrapMode([System.Drawing.Drawing2D.WrapMode]::TileFlipXY)
  $g.DrawImage($src, (New-Object System.Drawing.Rectangle $o, $o, $w, $w), 0, 0, $src.Width, $src.Height, [System.Drawing.GraphicsUnit]::Pixel, $attr)
  $attr.Dispose()
  $g.Dispose()
  # Shrunk onto a background: feather the picture's outer band into the background, so no square edge shows.
  if ($scale -lt 1) {
    $band = [int]($w * 0.08)
    for ($y = $o; $y -lt $o + $w; $y++) {
      for ($x = $o; $x -lt $o + $w; $x++) {
        $d = [Math]::Min([Math]::Min($x - $o, $o + $w - 1 - $x), [Math]::Min($y - $o, $o + $w - 1 - $y))
        if ($d -ge $band) { continue }
        $t = $d / $band; $t = $t * $t * (3 - 2 * $t)
        $c = $bmp.GetPixel($x, $y)
        $bmp.SetPixel($x, $y, [System.Drawing.Color]::FromArgb(255,
          [int]($bg.R + ($c.R - $bg.R) * $t), [int]($bg.G + ($c.G - $bg.G) * $t), [int]($bg.B + ($c.B - $bg.B) * $t)))
      }
    }
  }
  $path = Join-Path $here $out
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  "{0,-28} {1}x{1}  {2:N0} bytes" -f $out, $size, (Get-Item $path).Length
}

Save-Icon 512 1.0 "public/icon-512.png"
Save-Icon 192 1.0 "public/icon-192.png"
Save-Icon 180 1.0 "public/apple-touch-icon.png"
Save-Icon 512 0.72 "public/icon-maskable-512.png"
Save-Icon 48 1.0 "assets/favicon.png"
$src.Dispose()
