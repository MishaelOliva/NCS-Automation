param(
  [switch]$SkipChecks
)

$ErrorActionPreference = 'Stop'

function Write-Note {
  param([string]$Message)
  Write-Host "[bootstrap] $Message"
}

function Test-Tool {
  param([string]$Name)
  return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

function Find-NodePath {
  $candidateCommands = @('node', 'node.exe')
  foreach ($candidate in $candidateCommands) {
    $command = Get-Command $candidate -ErrorAction SilentlyContinue
    if ($command) {
      return $command.Path
    }
  }

  $candidatePaths = @(
    (Join-Path $env:ProgramFiles 'nodejs\node.exe'),
    (Join-Path ${env:ProgramFiles(x86)} 'nodejs\node.exe')
  ) | Where-Object { $_ -and (Test-Path $_) }

  return $candidatePaths | Select-Object -First 1
}

function Find-NpmPath {
  $candidateCommands = @('npm', 'npm.cmd')
  foreach ($candidate in $candidateCommands) {
    $command = Get-Command $candidate -ErrorAction SilentlyContinue
    if ($command) {
      return $command.Path
    }
  }

  $candidatePaths = @(
    (Join-Path $env:ProgramFiles 'nodejs\npm.cmd'),
    (Join-Path ${env:ProgramFiles(x86)} 'nodejs\npm.cmd')
  ) | Where-Object { $_ -and (Test-Path $_) }

  return $candidatePaths | Select-Object -First 1
}

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

$nodePath = Find-NodePath
$npmPath = Find-NpmPath

if (-not $nodePath -or -not $npmPath) {
  Write-Note 'Node.js/npm were not found. Trying to install Node.js LTS for this machine.'

  if (Test-Tool 'winget') {
    & winget install --id OpenJS.NodeJS.LTS -e --accept-package-agreements --accept-source-agreements
  }
  elseif (Test-Tool 'choco') {
    & choco install nodejs-lts -y
  }
  else {
    throw 'Neither winget nor choco is available. Install Node.js LTS manually, then rerun bootstrap.'
  }

  $nodePath = Find-NodePath
  $npmPath = Find-NpmPath
}

if (-not $nodePath -or -not $npmPath) {
  throw 'Node.js/npm are still unavailable after installation. Open a new terminal and rerun bootstrap.'
}

Write-Note "Using Node at $nodePath"
Write-Note "Using npm at $npmPath"

if (Test-Path (Join-Path $root 'package.json')) {
  Write-Note 'Installing project dependencies.'
  & $npmPath install

  if (-not $SkipChecks) {
    Write-Note 'Running protocol checks.'
    & $npmPath run check
  }
}
else {
  Write-Note 'No package.json found in the current folder, so dependency installation was skipped.'
}
