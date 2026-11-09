/* Senha única: bloqueio do app e proteção do backup */
    // =========================================================================
    // SENHA ÚNICA: bloqueia o app e protege o backup
    // =========================================================================
    const SENHA_KEY = 'guia_senha';
    let senhaSessao = null, tentativasSenha = 0, bloqueadoAte = 0;
    function senhaDefinida() { try { return !!localStorage.getItem(SENHA_KEY); } catch (e) { return false; } }
    function cryptoOk() { return !!(window.crypto && crypto.subtle && window.isSecureContext); }
    async function hashSenha(senha, salt, iter) {
      const km = await crypto.subtle.importKey('raw', new TextEncoder().encode(senha), 'PBKDF2', false, ['deriveBits']);
      return paraB64(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' }, km, 256));
    }
    // Senha pedida após 6 horas sem uso: guarda o momento da última atividade (em ms)
    const SENHA_INATIVO_MS = 6 * 60 * 60 * 1000;
    function diaLocalHoje() { const d = new Date(), p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; }
    function marcarDestravadoHoje() { try { localStorage.setItem('guia_destravado', String(Date.now())); } catch (e) {} }
    function destravadoHoje() { try { const t = Number(localStorage.getItem('guia_destravado')); return t > 0 && (Date.now() - t) < SENHA_INATIVO_MS && t <= Date.now() + 60000; } catch (e) { return false; } }
    async function gravarSenhaApp(senha) {
      const salt = crypto.getRandomValues(new Uint8Array(16)), iter = 250000;
      localStorage.setItem(SENHA_KEY, JSON.stringify({ salt: paraB64(salt), iter, hash: await hashSenha(senha, salt, iter) }));
      senhaSessao = senha; marcarDestravadoHoje();
    }
    async function conferirSenhaApp(senha) {
      const o = JSON.parse(localStorage.getItem(SENHA_KEY)); if (!o) return false;
      return (await hashSenha(senha, deB64(o.salt), o.iter)) === o.hash;
    }
    function travarApp() {
      if (!senhaDefinida() || !cryptoOk()) return;
      senhaSessao = null; document.documentElement.classList.add('travado');
      atualizarBotaoBio();
      setTimeout(() => { if (bioAtiva() && bioSuportada()) destravarComBiometria(); else { const c = document.getElementById('bloqSenha'); if (c) c.focus(); } }, 200);
    }
    async function destravarApp() {
      const campo = document.getElementById('bloqSenha'), av = document.getElementById('bloqAviso');
      if (Date.now() < bloqueadoAte) { av.textContent = `Aguarde ${Math.ceil((bloqueadoAte - Date.now()) / 1000)} s para tentar de novo.`; return; }
      let ok = false; try { ok = await conferirSenhaApp(campo.value); } catch (e) {}
      if (ok) { senhaSessao = campo.value; campo.value = ''; av.textContent = ''; tentativasSenha = 0; document.documentElement.classList.remove('travado'); marcarDestravadoHoje(); atualizarStatusBackup(); return; }
      tentativasSenha++; campo.value = '';
      if (tentativasSenha >= 5) { bloqueadoAte = Date.now() + 30000; tentativasSenha = 0; av.textContent = 'Muitas tentativas. Aguarde 30 segundos.'; }
      else av.textContent = `Senha incorreta (${tentativasSenha}/5).`;
    }
    function esqueciSenha() {
      if (!confirm('Para criar uma nova senha é preciso APAGAR todos os dados deste aparelho (cidadãos, anotações, visitas e retornos). Depois você pode importar as planilhas de novo ou restaurar um backup, que continua exigindo a senha antiga. Apagar agora?')) return;
      try { localStorage.removeItem(SENHA_KEY); localStorage.removeItem('guia_bio'); localStorage.removeItem('guia_destravado'); localStorage.removeItem('guia_mudancas'); } catch (e) {}
      senhaSessao = null; historicoCache = [];
      BASE_DADOS = { cidadaos: {}, ruas: new Set() };
      filaSalvar = filaSalvar.then(() => BaseIDB.del('base')).then(() => BaseIDB.del('historico')).catch(() => {});
      document.documentElement.classList.remove('travado');
      atualizarInterface(); atualizarCardSenha(); alternarAba('alertas');
    }
    // Bloqueio por inatividade: a senha é pedida se o app ficou 6 horas sem uso (qualquer toque renova o prazo)
    let ultimaAtividade = Date.now();
    function conferirInatividade() { if (senhaDefinida() && !document.documentElement.classList.contains('travado') && !destravadoHoje()) travarApp(); }
    ['pointerdown', 'keydown', 'touchstart', 'scroll', 'wheel'].forEach(ev => document.addEventListener(ev, () => {
      if (document.documentElement.classList.contains('travado') || !senhaDefinida()) return;
      if (!destravadoHoje()) { travarApp(); return; }   // passou de 6 h sem uso: pede a senha
      const t = Date.now(); if (t - ultimaAtividade > 30000) { ultimaAtividade = t; marcarDestravadoHoje(); }   // renova o prazo (no máximo a cada 30 s)
    }, { passive: true, capture: true }));
    document.addEventListener('visibilitychange', () => { if (!document.hidden) conferirInatividade(); });
    setInterval(conferirInatividade, 30000);


    // =========================================================================
    // BIOMETRIA (impressão digital / rosto do próprio celular, via WebAuthn). Só destrava a tela;
    // a senha continua valendo e é o que protege os arquivos de backup.
    // =========================================================================
    const BIO_KEY = 'guia_bio';
    function bioSuportada() { return !!(window.PublicKeyCredential && navigator.credentials && window.isSecureContext); }
    function bioAtiva() { try { return !!localStorage.getItem(BIO_KEY); } catch (e) { return false; } }
    async function ativarBiometria() {
      const av = document.getElementById('statusBio');
      if (!bioSuportada()) { av.textContent = 'Este aparelho/endereço não permite biometria (precisa de https).'; return; }
      try {
        const cred = await navigator.credentials.create({ publicKey: {
          challenge: crypto.getRandomValues(new Uint8Array(32)), rp: { name: 'Guia de Visitas TACS' },
          user: { id: crypto.getRandomValues(new Uint8Array(16)), name: 'acs', displayName: 'ACS' },
          pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
          authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' }, timeout: 60000 } });
        localStorage.setItem(BIO_KEY, paraB64(cred.rawId)); avisoToast('Biometria ativada.');
      } catch (e) { av.textContent = 'Não foi possível ativar: ' + (e && e.name === 'NotAllowedError' ? 'cancelado ou sem biometria cadastrada no celular.' : (e && e.message || 'erro')); }
      atualizarCardSenha();
    }
    function desativarBiometria() { try { localStorage.removeItem(BIO_KEY); } catch (e) {} avisoToast('Biometria desativada.'); atualizarCardSenha(); }
    async function destravarComBiometria() {
      const av = document.getElementById('bloqAviso');
      if (!bioAtiva() || !bioSuportada()) return;
      try {
        await navigator.credentials.get({ publicKey: { challenge: crypto.getRandomValues(new Uint8Array(32)),
          allowCredentials: [{ type: 'public-key', id: deB64(localStorage.getItem(BIO_KEY)) }], userVerification: 'required', timeout: 60000 } });
        senhaSessao = null; av.textContent = ''; tentativasSenha = 0; document.documentElement.classList.remove('travado'); marcarDestravadoHoje(); atualizarStatusBackup();
      } catch (e) { av.textContent = 'Biometria não reconhecida. Use a senha.'; }
    }
    function atualizarBotaoBio() { const b = document.getElementById('bloqBio'); if (b) b.style.display = (bioAtiva() && bioSuportada()) ? '' : 'none'; }

    let modoSenha = 'definir';

    atualizarBotaoBio();
    if (document.documentElement.classList.contains('travado')) setTimeout(() => { if (bioAtiva() && bioSuportada()) destravarComBiometria(); }, 600);
