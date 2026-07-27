param(
  [string]$RepositoryRoot = (Split-Path -Parent $PSScriptRoot)
)

Add-Type -AssemblyName System.Drawing

$sourcePath = Join-Path $RepositoryRoot 'src\assets\brand\logo-ra-training.png'
$publicPath = Join-Path $RepositoryRoot 'public'
$lightAssetPath = Join-Path $RepositoryRoot 'src\assets\brand\logo-ra-training-on-light.png'
$source = [System.Drawing.Bitmap]::FromFile($sourcePath)
$corporateBlue = [System.Drawing.Color]::FromArgb(255, 17, 72, 153)

function New-RoundedPath([System.Drawing.RectangleF]$bounds, [float]$radius) {
  $diameter = $radius * 2
  $path = [System.Drawing.Drawing2D.GraphicsPath]::new()
  $path.AddArc($bounds.X, $bounds.Y, $diameter, $diameter, 180, 90)
  $path.AddArc($bounds.Right - $diameter, $bounds.Y, $diameter, $diameter, 270, 90)
  $path.AddArc($bounds.Right - $diameter, $bounds.Bottom - $diameter, $diameter, $diameter, 0, 90)
  $path.AddArc($bounds.X, $bounds.Bottom - $diameter, $diameter, $diameter, 90, 90)
  $path.CloseFigure()
  return $path
}

function Save-BrandIcon([int]$size, [string]$path) {
  $bitmap = [System.Drawing.Bitmap]::new($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.Clear([System.Drawing.Color]::Transparent)
  $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceOver
  $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias

  $outerMargin = [Math]::Max(0.5, $size * 0.04)
  $container = [System.Drawing.RectangleF]::new(
    [float]$outerMargin,
    [float]$outerMargin,
    [float]($size - (2 * $outerMargin)),
    [float]($size - (2 * $outerMargin))
  )
  $containerPath = New-RoundedPath $container ([float]($container.Width * 0.22))
  $brush = [System.Drawing.SolidBrush]::new($corporateBlue)
  $graphics.FillPath($brush, $containerPath)

  $maxLogoWidth = $size * 0.70
  $maxLogoHeight = $size * 0.72
  $scale = [Math]::Min($maxLogoWidth / $source.Width, $maxLogoHeight / $source.Height)
  $logoWidth = $source.Width * $scale
  $logoHeight = $source.Height * $scale
  $logoBounds = [System.Drawing.RectangleF]::new(
    [float](($size - $logoWidth) / 2),
    [float](($size - $logoHeight) / 2),
    [float]$logoWidth,
    [float]$logoHeight
  )
  $graphics.DrawImage($source, $logoBounds)

  $directory = Split-Path -Parent $path
  if (-not (Test-Path -LiteralPath $directory)) { [System.IO.Directory]::CreateDirectory($directory) | Out-Null }
  $bitmap.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)

  $brush.Dispose()
  $containerPath.Dispose()
  $graphics.Dispose()
  $bitmap.Dispose()
}

try {
  Save-BrandIcon 16 (Join-Path $publicPath 'favicon-16x16.png')
  Save-BrandIcon 32 (Join-Path $publicPath 'favicon-32x32.png')
  Save-BrandIcon 48 (Join-Path $publicPath 'favicon-48x48.png')
  Save-BrandIcon 48 (Join-Path $publicPath 'favicon.png')
  Save-BrandIcon 180 (Join-Path $publicPath 'apple-touch-icon.png')
  Save-BrandIcon 512 (Join-Path $publicPath 'icon-512x512.png')
  Save-BrandIcon 512 $lightAssetPath
} finally {
  $source.Dispose()
}
