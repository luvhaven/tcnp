$word = New-Object -ComObject Word.Application
$word.Visible = $false

$docPath1 = (Resolve-Path "sop\TCNP SOP Manual (1).docx").Path
$doc1 = $word.Documents.Open($docPath1)
$text1 = $doc1.Content.Text
$doc1.Close([ref]$false)
$text1 | Out-File -FilePath "sop\sop_manual.txt" -Encoding utf8

$docPath2 = (Resolve-Path "sop\TCNP Operation Terminologies (FOR TCN PROTOCOL MEMBERS ONLY) (2).docx").Path
$doc2 = $word.Documents.Open($docPath2)
$text2 = $doc2.Content.Text
$doc2.Close([ref]$false)
$text2 | Out-File -FilePath "sop\terminologies.txt" -Encoding utf8

$word.Quit()
Write-Host "Done - both files extracted"
