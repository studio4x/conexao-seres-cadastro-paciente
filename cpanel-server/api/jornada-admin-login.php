<?php
declare(strict_types=1);
header('Content-Type: application/json; charset=utf-8');header('Cache-Control: no-store, private');
function reply(array $p,int $s=200,?string $cookie=null):never{http_response_code($s);if($cookie!==null)header('Set-Cookie: '.$cookie,false);echo json_encode($p,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);exit;}
function b64u(string $v):string{return rtrim(strtr(base64_encode($v),'+/','-_'),'=');}
function verify_pbkdf2(string $password,string $verifier):bool{$p=explode('$',$verifier);if(count($p)!==4||$p[0]!=='pbkdf2_sha256')return false;$it=(int)$p[1];$salt=ctype_xdigit($p[2])?hex2bin($p[2]):false;if($it<100000||$it>1000000||$salt===false||strlen($salt)<16||preg_match('/^[0-9a-f]{64}$/i',$p[3])!==1)return false;return hash_equals(strtolower($p[3]),hash_pbkdf2('sha256',$password,$salt,$it,64,false));}
if($_SERVER['REQUEST_METHOD']!=='POST')reply(['message'=>'Método não permitido.'],405);
$config=[];$file=__DIR__.'/config.php';if(is_file($file)){$x=require $file;if(is_array($x))$config=$x;}
$email=strtolower(trim((string)($config['jornada_admin_email']??'contato@conexaoseres.com.br')));$verifier=trim((string)($config['jornada_admin_password_pbkdf2']??''));$secret=trim((string)($config['jornada_admin_session_secret']??''));
if($verifier===''||strlen($secret)<32)reply(['message'=>'O acesso administrativo ainda não foi configurado no servidor.'],503);
$body=json_decode(file_get_contents('php://input')?:'',true);if(!is_array($body))reply(['message'=>'Dados inválidos.'],400);
$user=strtolower(trim((string)($body['email']??'')));$password=(string)($body['password']??'');
if(!hash_equals($email,$user)||$password===''||strlen($password)>256||!verify_pbkdf2($password,$verifier))reply(['message'=>'E-mail ou senha inválidos.'],401);
$payload=b64u(json_encode(['email'=>$email,'exp'=>time()+28800],JSON_UNESCAPED_SLASHES));$token=$payload.'.'.b64u(hash_hmac('sha256',$payload,$secret,true));
reply(['success'=>true,'email'=>$email],200,'cs_jornada_admin='.$token.'; Path=/; Max-Age=28800; HttpOnly; Secure; SameSite=Strict');
