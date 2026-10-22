# Makes the logo's light background transparent (Windows, no extra tools).
#   powershell -File scripts/remove-background.ps1 <in.png> <out.png>
# Flood-fills from the picture's edges through near-white, low-colour pixels only, so light parts inside the
# drawing (the whites of the eyes) stay; then softens the cut edge so it does not look jagged.
param([Parameter(Mandatory)][string]$In, [Parameter(Mandatory)][string]$Out)
Add-Type -AssemblyName System.Drawing
Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @"
using System; using System.Collections.Generic; using System.Drawing; using System.Drawing.Imaging; using System.Runtime.InteropServices;
public static class BgRemove {
  static bool Light(byte r, byte g, byte b) { int mn = Math.Min(r, Math.Min(g, b)), mx = Math.Max(r, Math.Max(g, b)); return mn >= 212 && mx - mn <= 42; }
  public static int[] Run(string inPath, string outPath) {
    using (var src = new Bitmap(inPath))
    using (var bmp = new Bitmap(src.Width, src.Height, PixelFormat.Format32bppArgb)) {
      using (var g = Graphics.FromImage(bmp)) g.DrawImage(src, 0, 0, src.Width, src.Height);
      int w = bmp.Width, h = bmp.Height;
      var rect = new Rectangle(0, 0, w, h);
      var data = bmp.LockBits(rect, ImageLockMode.ReadWrite, PixelFormat.Format32bppArgb);
      var px = new byte[data.Stride * h]; Marshal.Copy(data.Scan0, px, 0, px.Length);
      Func<int, int, int> at = (x, y) => y * data.Stride + x * 4; // B G R A
      var bg = new bool[w * h]; var q = new Queue<int>();
      for (int x = 0; x < w; x++) { q.Enqueue(x); q.Enqueue((h - 1) * w + x); }
      for (int y = 0; y < h; y++) { q.Enqueue(y * w); q.Enqueue(y * w + w - 1); }
      int removed = 0;
      while (q.Count > 0) {
        int i = q.Dequeue(); if (bg[i]) continue;
        int x = i % w, y = i / w, o = at(x, y);
        if (!Light(px[o + 2], px[o + 1], px[o])) continue;
        bg[i] = true; removed++;
        if (x > 0) q.Enqueue(i - 1); if (x < w - 1) q.Enqueue(i + 1); if (y > 0) q.Enqueue(i - w); if (y < h - 1) q.Enqueue(i + w);
      }
      int soft = 0;
      for (int y = 0; y < h; y++) for (int x = 0; x < w; x++) {
        int i = y * w + x, o = at(x, y);
        if (bg[i]) { px[o + 3] = 0; continue; }
        bool edge = false; // within 2 px of the removed background
        for (int dy = -2; dy <= 2 && !edge; dy++) for (int dx = -2; dx <= 2 && !edge; dx++) {
          int nx = x + dx, ny = y + dy; if (nx >= 0 && ny >= 0 && nx < w && ny < h && bg[ny * w + nx]) edge = true; }
        if (!edge) continue;
        int mn = Math.Min(px[o + 2], Math.Min(px[o + 1], px[o]));
        double a = Math.Max(0.0, Math.Min(1.0, (236.0 - mn) / 60.0)); // lighter fringe pixels fade out
        px[o + 3] = (byte)(px[o + 3] * a); soft++;
      }
      Marshal.Copy(px, 0, data.Scan0, px.Length); bmp.UnlockBits(data);
      bmp.Save(outPath, ImageFormat.Png);
      return new int[] { w, h, removed, soft };
    }
  }
}
"@
$r = [BgRemove]::Run((Resolve-Path $In).Path, [System.IO.Path]::GetFullPath($Out))
"{0}x{1}: {2:N0} background pixels made transparent ({3:P1}), {4:N0} edge pixels softened" -f $r[0], $r[1], $r[2], ($r[2] / ($r[0] * $r[1])), $r[3]
