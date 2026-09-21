<?php
declare(strict_types=1);
header('Content-Type: application/json; charset=utf-8');header('Cache-Control: no-store, private');header('Set-Cookie: cs_jornada_admin=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict');
if($_SERVER['REQUEST_METHOD']!=='POST'){http_response_code(405);echo json_encode(['message'=>'Método não permitido.']);exit;}echo json_encode(['success'=>true]);
