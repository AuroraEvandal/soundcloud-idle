Add-Type -AssemblyName System.Drawing
$sheet = [System.Drawing.Bitmap]::new((Join-Path $PSScriptRoot 'pet-sheet.png'))
$names = @('soundity','micity','scalevillity')
$poses = @('idle','happy','sleep','confused','music')
$rows = @(0,323,642,1024)
for ($r=0; $r -lt 3; $r++) {
  $dir = Join-Path (Join-Path $PSScriptRoot '../public/pets') $names[$r]
  New-Item -ItemType Directory -Force $dir | Out-Null
  for ($c=0; $c -lt 5; $c++) {
    $x = [int][Math]::Floor($c * $sheet.Width / 5)
    $nextX = [int][Math]::Floor(($c+1) * $sheet.Width / 5)
    $minX=$nextX; $minY=$rows[$r+1]; $maxX=$x; $maxY=$rows[$r]
    for($py=$rows[$r];$py -lt $rows[$r+1];$py++) {
      for($px=$x;$px -lt $nextX;$px++) {
        if($sheet.GetPixel($px,$py).A -gt 30) {
          $minX=[Math]::Min($minX,$px); $maxX=[Math]::Max($maxX,$px)
          $minY=[Math]::Min($minY,$py); $maxY=[Math]::Max($maxY,$py)
        }
      }
    }
    $rect=[System.Drawing.Rectangle]::new($minX,$minY,$maxX-$minX+1,$maxY-$minY+1)
    $sprite=$sheet.Clone($rect,[System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $canvas=[System.Drawing.Bitmap]::new(320,320)
    $g=[System.Drawing.Graphics]::FromImage($canvas)
    $g.InterpolationMode=[System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
    $scale=[Math]::Min(288/$sprite.Width,288/$sprite.Height)
    $w=[int]($sprite.Width*$scale);$h=[int]($sprite.Height*$scale)
    $g.DrawImage($sprite,[System.Drawing.Rectangle]::new([int]((320-$w)/2),[int]((320-$h)/2),$w,$h),0,0,$sprite.Width,$sprite.Height,[System.Drawing.GraphicsUnit]::Pixel)
    $canvas.Save((Join-Path $dir ($poses[$c]+'.png')),[System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose(); $canvas.Dispose(); $sprite.Dispose()
  }
}
$sheet.Dispose()

