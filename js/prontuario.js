/* Prontuário do cidadão: cabeçalho, resumo com módulo por perfil, linha do tempo, indicadores em checklist, vacinas e anotações */
    let chaveProntuario = null, abaProntuario = 'resumo', indDetalhe = null, filtroLinha = 'tudo';
    const PR_NOMES = { C1: 'Cadastro', C2: 'Criança', C3: 'Gestante', C4: 'Diabetes', C5: 'Hipertensão', C6: 'Pessoa idosa', C7: 'Saúde da mulher' };
    const PR_COR = { C1: '#0284c7', C2: '#d97706', C3: '#0d9488', C4: '#7c3aed', C5: '#dc2626', C6: '#2563eb', C7: '#db2777' };
    function prontISO(s) { s = String(s || '').trim(); let m; if ((m = s.match(/(\d{2})\/(\d{2})\/(\d{4})/))) return `${m[3]}-${m[2]}-${m[1]}`; if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})/))) return m[0]; return ''; }
    function prontDatas(t) { return (String(t || '').match(/\d{2}\/\d{2}\/\d{4}/g) || []).map(prontISO); }
    function prChip(k) { return `<span class="pr-chip" style="background:${PR_COR[k]}1a;color:${PR_COR[k]}">${k} · ${PR_NOMES[k]}</span>`; }
    function prIndsDe(c) { return ['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7'].filter(k => k === 'C1' || (c.indicadores && c.indicadores[k])); }
    function prAlertas(chave) { try { return gerarAlertas(400).filter(a => a.chave === chave); } catch (e) { return []; } }

    // ---- checklist de cada indicador: itens fixos (feito quando nenhuma pendência o cita) + pendências que não casam com nenhum
    const PR_ITENS = {
      C1: [['Cadastro individual atualizado', /individual/i], ['Cadastro domiciliar atualizado', /domiciliar/i], ['CPF preenchido', /cpf/i]],
      C2: [['2 visitas domiciliares', /visita/i], ['Vacinas em dia', /vacina|caderneta/i]],
      C3: [['3 visitas no pré-natal', /Visitar \(pré/i], ['Visita à mãe e ao bebê (puerpério)', /puérpera|puerp/i], ['Captação precoce (até 12 semanas)', /Captação/i], ['6 consultas de pré-natal', /Consultas Pré-Natal/i], ['Avaliação odontológica', /Odontol/i]],
      C4: [['2 visitas do ACS em 12 meses', /visita/i], ['Hemoglobina glicada', /Hemoglobina/i], ['Avaliação dos pés', /pés/i]],
      C5: [['2 visitas do ACS em 12 meses', /visita/i], ['Pressão arterial aferida no semestre', /Aferição/i], ['Consulta no semestre', /Consulta semestral/i]],
      C6: [['2 visitas do ACS em 12 meses', /visita/i], ['Vacina da gripe (influenza)', /Influenza/i], ['Consulta no ano', /Consulta anual/i]],
      C7: []
    };
    function prChecklist(c, k) {
      const pend = (c.pendencias || []).filter(p => p.startsWith(k + ':')).map(p => p.slice(3).trim());
      const usadas = new Set(), itens = [];
      if (k === 'C7') {
        const it = (c.c7_base && c.c7_base.itens) || {}, anos = c.dt_nascimento ? idadeEmAnos(c.dt_nascimento) : null, fx = faixasC7(anos, c.sexo);
        if (fx.hpv) {   // meninas de 9 a 14 anos: a meta é a vacina HPV
          const st = estadoHpv(c), ok = st.tipo === 'ok';
          itens.push({ nome: 'Vacina HPV', ok, pend: !ok, nota: ok ? (st.txt || 'em dia') : (st.tipo === 'atrasada' ? 'dose atrasada' + (st.doses && st.doses.length ? ' (' + st.doses.join(', ') + ')' : '') : (st.tipo === 'aplicar' ? 'dose liberada, ainda sem registro' : 'sem informação nas planilhas de vacinação')) });
        }
        [['consulta', 'Consulta de saúde sexual', /consulta/i], ['colo', 'Exame preventivo (colo do útero)', /colo|preventivo/i], ['mama', 'Mamografia', /mama/i]].forEach(([f, nome, re]) => {
          if (!fx[f] || !it[f]) return; const p = pend.find(x => re.test(x)); if (p) usadas.add(p);
          itens.push({ nome, ok: !!it[f].ok && !p, pend: !(it[f].ok && !p), nota: it[f].dt ? 'registrado em ' + it[f].dt : (p || 'sem registro') });
        });
      } else {
        (PR_ITENS[k] || []).forEach(([nome, re]) => {
          const p = pend.find(x => re.test(x) && !usadas.has(x)); if (p) usadas.add(p);
          let nota = p || '';
          if (!p && /visita/i.test(nome)) { const ds = k === 'C2' ? [c.c2_v1, c.c2_v2].filter(Boolean) : (c[k.toLowerCase() + '_vis_txt'] ? prontDatas(c[k.toLowerCase() + '_vis_txt']).map(dataBR) : []); if (ds.length) nota = 'feitas em ' + ds.join(' e '); }
          itens.push({ nome, ok: !p, nota: nota || 'PEC', pend: !!p });
        });
      }
      pend.filter(p => !usadas.has(p)).forEach(p => itens.push({ nome: p, ok: false, nota: '', pend: true }));
      if (k === 'C1' && c.c1Ok === false && !itens.some(i => !i.ok)) itens.push({ nome: 'Cadastro com pendência', ok: false, nota: '' });
      const feitos = itens.filter(i => i.ok).length;
      return { itens, feitos, total: itens.length, faltam: itens.length - feitos, tempo: c[k.toLowerCase() + '_tempo'] };
    }

    // ---- eventos da linha do tempo
    function prEventos(c) {
      const ev = [], add = (iso, titulo, origem, inds, tipo, det) => { if (iso) ev.push({ iso, titulo, origem, inds: inds || [], tipo, det }); };
      (c.visitasApp || []).forEach(v => add(prontISO(v.d), 'Visita domiciliar', 'Registrado pelo ACS', v.inds || [], 'visita'));
      add(prontISO(c.c2_v1), '1ª visita domiciliar', 'Importado do PEC', ['C2'], 'visita'); add(prontISO(c.c2_v2), '2ª visita domiciliar', 'Importado do PEC', ['C2'], 'visita');
      [['C4', c.c4_vis_txt], ['C5', c.c5_vis_txt], ['C6', c.c6_vis_txt]].forEach(([k, t]) => prontDatas(t).forEach(d => add(d, 'Visita domiciliar', 'Importado do PEC', [k], 'visita')));
      add(prontISO(c.dt_cadastral), 'Cadastro individual atualizado', 'Importado do PEC', ['C1'], 'cadastro'); add(prontISO(c.dt_cad_dom), 'Cadastro domiciliar atualizado', 'Importado do PEC', ['C1'], 'cadastro');
      const m = c.med || {};
      add(prontISO(m.dtPeso), 'Peso e altura', 'Importado do PEC', [], 'exame', [m.peso ? m.peso + ' kg' : '', m.altura ? m.altura + ' cm' : ''].filter(Boolean).join(' · '));
      add(prontISO(m.dtPa), 'Pressão arterial', 'Importado do PEC', ['C5'], 'consulta', m.pa ? 'Pressão ' + m.pa : '');
      add(prontISO(m.dtHg), 'Exame: hemoglobina glicada', 'Importado do PEC', ['C4'], 'exame', m.hg !== undefined ? 'Resultado ' + m.hg + '%' : '');
      const it = (c.c7_base && c.c7_base.itens) || {};
      add(prontISO(it.colo && it.colo.dt), 'Exame preventivo', 'Importado do PEC', ['C7'], 'exame'); add(prontISO(it.mama && it.mama.dt), 'Mamografia', 'Importado do PEC', ['C7'], 'exame'); add(prontISO(it.consulta && it.consulta.dt), 'Consulta', 'Importado do PEC', ['C7'], 'consulta');
      (c.retornos || []).forEach(r => add(r.d, 'Retorno ' + (r.feito ? 'feito' : 'agendado'), 'Registrado pelo ACS', [], 'retorno', r.nota || ''));
      return ev;
    }
    const PR_ICO = { visita: ['#0284c7', '🏠'], consulta: ['#dc2626', '🩺'], exame: ['#7c3aed', '🧪'], vacina: ['#16a34a', '💉'], cadastro: ['#0369a1', '📄'], retorno: ['#d97706', '📅'] };

    // ---- cabeçalho
    function prCabecalho(chave, c) {
      const ini = (c.nome || '?').trim().split(/\s+/).map(x => x[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
      const inds = prIndsDe(c).filter(k => k !== 'C1'), pend = (c.pendencias || []).length, al = prAlertas(chave);
      const urgente = al.some(a => a.atrasado), cor = inds.length ? PR_COR[inds[0]] : '#0284c7';
      const idade = c.dt_nascimento ? calcularIdade(c.dt_nascimento) : (c.idade_txt || '');
      const tags = inds.map(k => `<span class="pr-chip" style="background:${PR_COR[k]}1a;color:${PR_COR[k]}">${PR_NOMES[k]}</span>`).join('') + (c.bolsaFamilia ? '<span class="pr-chip" style="background:#dcfce7;color:#15803d">Bolsa Família</span>' : '');
      const sexo = /^f/i.test(c.sexo || '') ? 'Feminino' : (/^m/i.test(c.sexo || '') ? 'Masculino' : '');
      return `<div class="pr-cab" style="border-left-color:${cor}"><div class="pr-cab-top"><div class="pr-av" style="background:${cor}22;color:${cor}">${escHtml(ini)}</div><div class="pr-cab-id"><div class="pr-cab-nome">${escHtml(c.nome)}</div><div class="pr-cab-sub">${[idade, sexo, c.dt_nascimento].filter(Boolean).map(escHtml).join(' · ')}</div></div><span class="pr-pilula ${urgente ? 'urg' : (pend ? 'pen' : 'ok')}">${urgente ? 'Urgente' : (pend ? pend + ' pendência(s)' : 'Em dia')}</span></div><div class="pr-cab-end">📍 ${escHtml(c.rua || 'Sem rua')}, nº ${escHtml(numeroComComplemento(c) || 'S/N')}</div><div class="pr-tags">${tags}</div></div>`;
    }


    // ---- cartão de vacinas (0 a 24 meses): calendário esperado, com a posição de cada vacina em falta
    const prVN = (v) => normalizarTexto(v || '');
    const prP = (re, doses) => (n, d) => re.test(n) && doses.includes(d);
    const PR_CAL = [
      [0, 'BCG', prP(/bcg/, ['DU', 'D', 'D1'])], [0, 'Hepatite B', prP(/hepatite b/, ['D', 'D1', 'DU'])],
      [2, 'Penta 1ª', prP(/penta/, ['D1'])], [2, 'Pólio 1ª', prP(/polio|vip/, ['D1'])], [2, 'Pneumo 1ª', prP(/pneumo/, ['D1'])], [2, 'Rotavírus 1ª', prP(/rotav/, ['D1'])],
      [3, 'Meningo C 1ª', prP(/meningo c/, ['D1'])],
      [4, 'Penta 2ª', prP(/penta/, ['D2'])], [4, 'Pólio 2ª', prP(/polio|vip/, ['D2'])], [4, 'Pneumo 2ª', prP(/pneumo/, ['D2'])], [4, 'Rotavírus 2ª', prP(/rotav/, ['D2'])],
      [5, 'Meningo C 2ª', prP(/meningo c/, ['D2'])],
      [6, 'Penta 3ª', prP(/penta/, ['D3'])], [6, 'Pólio 3ª', prP(/polio|vip/, ['D3'])], [6, 'Influenza 1ª', prP(/influenza/, ['D1'])],
      [7, 'Influenza 2ª', prP(/influenza/, ['D2'])],
      [9, 'Febre amarela', prP(/febre amarela/, ['D', 'DU', 'D1'])],
      [12, 'Tríplice viral 1ª', prP(/triplice viral/, ['D1'])], [12, 'Pneumo reforço', prP(/pneumo/, ['REF'])], [12, 'Meningo C reforço', prP(/meningo c/, ['REF'])],
      [15, 'DTP reforço', prP(/dtp/, ['R1'])], [15, 'Pólio reforço', prP(/polio|vip/, ['R1'])], [15, 'Hepatite A', prP(/hepatite a/, ['DU', 'D1'])],
      [15, 'Tetraviral', (n, d) => /tetraviral/.test(n) || (/triplice viral/.test(n) && d === 'D2') || (/varicela/.test(n) && d === 'D1')]
    ];
    function prMeses(c) {
      const m = String(c.dt_nascimento || '').match(/(\d{2})\/(\d{2})\/(\d{4})/); if (!m) return null;
      const h = new Date(); let t = (h.getFullYear() - +m[3]) * 12 + (h.getMonth() + 1 - +m[2]); if (h.getDate() < +m[1]) t--; return Math.max(0, t);
    }
    function prCartaoVacinas(c) {
      const meses = prMeses(c); if (meses === null || meses > 24) return '';
      const dose = (x) => String(x.d || '').trim().toUpperCase();
      const atr = (c.vacAtraso || []).map(x => ({ x, n: prVN(x.v), d: dose(x) })), prz = (c.vacNoPrazo || []).map(x => ({ x, n: prVN(x.v), d: dose(x) }));
      const dados = !!(c.vacCob && c.vacCob.todas && c.vacCobPrazo);
      const usados = new Set(); let nA = 0, nP = 0, nOk = 0;
      const grupos = {};
      PR_CAL.forEach(([m, rot, f]) => {
        const a = atr.find(i => f(i.n, i.d)), p = !a && prz.find(i => f(i.n, i.d));
        if (a) usados.add(a.x); if (p) usados.add(p.x);
        let st = a ? 'atr' : (p ? 'prz' : (meses < m ? 'fut' : (dados ? 'ok' : 'nd')));
        if (st === 'atr') nA++; else if (st === 'prz') nP++; else if (st === 'ok') nOk++;
        (grupos[m] = grupos[m] || []).push(`<span class="pr-vc ${st}">${st === 'ok' ? '✓ ' : ''}${rot}${st === 'atr' ? ' · atrasada' : (st === 'prz' ? ' · no prazo' : '')}</span>`);
      });
      let h = Object.keys(grupos).map(m => `<div class="pr-vc-g"><div class="pr-vc-h">${m === '0' ? 'Ao nascer' : m + ' meses'}</div><div class="pr-vtags">${grupos[m].join('')}</div></div>`).join('');
      const outras = [...atr.map(i => [i, 'atr']), ...prz.map(i => [i, 'prz'])].filter(([i]) => !usados.has(i.x));
      if (outras.length) { outras.forEach(([i, st]) => { if (st === 'atr') nA++; else nP++; }); h += `<div class="pr-vc-g"><div class="pr-vc-h">Outras</div><div class="pr-vtags">${outras.map(([i, st]) => `<span class="pr-vc ${st}">${escHtml(textoDoseVacina(i.x))}${st === 'atr' ? ' · atrasada' : ' · no prazo'}</span>`).join('')}</div></div>`; }
      return h + `<small>${nA} atrasada(s) · ${nP} no prazo${dados ? ' · ' + nOk + ' sem pendência' : ''}${c.vacData ? ' · relatório de ' + escHtml(c.vacData) : ''}</small>` +
        `<div class="pr-vc-leg"><span class="pr-vc atr">atrasada</span><span class="pr-vc prz">no prazo</span><span class="pr-vc ok">sem pendência</span><span class="pr-vc fut">ainda não é a idade</span></div>` +
        (dados ? '' : '<small>Importe também a planilha "No prazo" para confirmar as vacinas sem pendência.</small>');
    }

    // ---- módulos por perfil
    function prModulos(chave, c) {
      let h = ''; const anos = c.dt_nascimento ? idadeEmAnos(c.dt_nascimento) : null, ind = c.indicadores || {};
      if (ind.C3) {
        const dpp = prontISO(c.c3_dpp); let sem = null;
        if (dpp) { const dias = Math.round((new Date(dpp + 'T12:00:00') - new Date()) / 864e5); sem = Math.max(0, Math.min(42, 40 - Math.ceil(dias / 7))); }
        const pc = (c.pendencias || []).find(p => /Consultas Pré-Natal \((\d+)\/6\)/.test(p)); const cons = pc ? +pc.match(/\((\d+)\/6\)/)[1] : (ind.C3 && (c.pendencias || []).some(p => p.startsWith('C3:')) ? null : 6);
        h += `<div class="pr-bloco"><div class="pr-tit">Gestação</div>${sem !== null ? `<div class="pr-grande">${sem} <small>semanas</small></div><div class="pr-barra"><i style="width:${Math.round(sem / 40 * 100)}%;background:#db2777"></i></div><small>Parto previsto: ${dataBR(dpp)}</small>` : '<small>Sem data provável do parto (DPP) no PEC.</small>'}</div>`;
        if (cons !== null) h += `<div class="pr-bloco"><div class="pr-tit">Pré-natal</div><div class="pr-lin"><b>Consultas</b><span>${cons} (meta: 6 ou mais)</span></div><div class="pr-bolas">${Array.from({ length: 6 }, (_, i) => `<i class="${i < cons ? 'on' : ''}"></i>`).join('')}</div><small>Visita do ACS: até 4 semanas após cada consulta.</small></div>`;
      }
      if (anos !== null && anos < 10 || ind.C2) {
        const v1 = !!c.c2_v1, v2 = !!c.c2_v2, n = (v1 ? 1 : 0) + (v2 ? 1 : 0), m = c.med || {};
        { const cv = prCartaoVacinas(c); h += `<div class="pr-bloco"><div class="pr-tit">Cartão de vacinas</div>${cv || prVacTags(c) || '<small>Sem dados de vacina importados.</small>'}</div>`; }
        h += `<div class="pr-bloco"><div class="pr-tit">Visitas do ACS (você)</div><div class="pr-lin"><b>Visitas domiciliares</b><span>${n} de 2</span></div><div class="pr-barra"><i style="width:${n * 50}%;background:#d97706"></i></div><small>${n >= 2 ? 'As 2 visitas já constam no PEC.' : 'Faltam ' + (2 - n) + ' visita(s): programe e registre.'}</small></div>`;
        h += `<div class="pr-bloco"><div class="pr-tit">Com a equipe de saúde</div><div class="pr-lin"><b>Peso e altura</b><span>${m.dtPeso ? '✓ ' + escHtml(m.dtPeso) : 'sem registro'}</span></div><small>${m.dtPeso ? 'Medidos na consulta ou na puericultura.' : 'Encaminhe ou agende a puericultura (enfermeira/médico).'}</small></div>`;
      }
      if (anos !== null && anos >= 60) {
        h += `<div class="pr-bloco"><div class="pr-tit">Vacinas</div>${prVacTags(c) || '<small>Sem dados de vacina importados.</small>'}</div>`;
      }
      return h;
    }
    function prVacTags(c) {
      const a = (c.vacAtraso || []).map(x => `<span class="pr-vtag atr">${escHtml(textoDoseVacina(x))} · atrasada</span>`), p = (c.vacNoPrazo || []).map(x => `<span class="pr-vtag prz">${escHtml(textoDoseVacina(x))} · no prazo</span>`);
      if (!a.length && !p.length) return '';
      return `<div class="pr-vtags">${a.join('')}${p.join('')}</div><small>${a.length} atrasada(s) · ${p.length} no prazo${c.vacData ? ' · relatório de ' + escHtml(c.vacData) : ''}</small>`;
    }

    // ---- abas
    function prResumo(chave, c) {
      const pend = c.pendencias || [], al = prAlertas(chave);
      let h = pend.length ? `<div class="pr-bloco pr-fazer"><div class="pr-fazer-t">⚠ Fazer na próxima visita (${pend.length})</div>${pend.map(p => { const k = p.slice(0, 2), ok = /^C[1-7]$/.test(k); return `<div class="pr-cartinha"><b>${escHtml(p.replace(/^C[1-7]:\s*/, ''))}</b>${ok ? `<div>${prChip(k)}</div>` : ''}</div>`; }).join('')}</div>`
                         : '<div class="pr-bloco pr-ok"><b>✓ Nenhuma pendência no momento</b></div>';
      if (al.length) h += `<div class="pr-bloco"><div class="pr-tit">Prazos</div>${al.map(a => `<div class="pr-lin2"><span>${escHtml(a.texto)}</span><small>${a.atrasado ? 'atrasado · ' : ''}${a.data ? dataBR(isoLocal(a.data instanceof Date ? a.data : new Date(a.data))) : ''}</small></div>`).join('')}</div>`;
      h += prModulos(chave, c);
      h += `<div class="pr-bloco"><div class="pr-tit">Indicadores desta pessoa</div>${prIndsDe(c).map(k => { const r = prChecklist(c, k); return `<div class="pr-indlin" onclick="abrirIndProntuario('${k}')"><div class="pr-lin"><b style="color:${PR_COR[k]}">${PR_NOMES[k]}</b><span>${r.feitos} de ${r.total} feitos ›</span></div><div class="pr-barra"><i style="width:${r.total ? Math.round(r.feitos / r.total * 100) : 100}%;background:${PR_COR[k]}"></i></div></div>`; }).join('')}</div>`;
      h += `<div class="pr-bloco"><div class="pr-tit">Medidas</div>${htmlMedidas(c)}</div>`;
      return h;
    }
    function prLinha(c, chave) {
      const hoje = isoLocal(new Date()), tipos = [['tudo', 'Tudo'], ['visita', 'Visitas'], ['consulta', 'Consultas'], ['exame', 'Exames'], ['cadastro', 'Cadastro'], ['retorno', 'Retornos']];
      const chips = `<div class="pr-filtros">${tipos.map(([k, n]) => `<button class="pr-aba${filtroLinha === k ? ' ativa' : ''}" onclick="filtroLinha='${k}';renderProntuario()">${n}</button>`).join('')}</div>`;
      let ev = prEventos(c).filter(e => filtroLinha === 'tudo' || e.tipo === filtroLinha).sort((a, b) => b.iso.localeCompare(a.iso));
      const pend = (c.pendencias || [])[0];
      let h = chips + (pend && filtroLinha === 'tudo' ? `<div class="pr-hoje"><small>HOJE · PENDENTE</small><b>${escHtml(pend.replace(/^C[1-7]:\s*/, ''))}</b></div>` : '');
      if (!ev.length) return h + '<div class="pr-vazio">Nada registrado neste filtro.</div>';
      let ano = '';
      ev.forEach(e => {
        const a = e.iso.slice(0, 4); if (a !== ano) { ano = a; h += `<div class="pr-ano">${a}</div>`; }
        const [cor, ico] = PR_ICO[e.tipo] || ['#64748b', '•'];
        h += `<div class="pr-ev"><div class="pr-ev-ico" style="background:${cor}">${ico}</div><div class="pr-ev-cx"><div class="pr-ev-top"><b>${escHtml(e.titulo)}</b><small>${dataBR(e.iso)}${e.iso > hoje ? ' · futuro' : ''}</small></div>${e.det ? `<div>${escHtml(e.det)}</div>` : ''}<div class="pr-ev-o">${e.inds.map(k => `<span class="pr-chip" style="background:${PR_COR[k]}1a;color:${PR_COR[k]}">${k} · ${PR_NOMES[k]}</span>`).join('')}<small>${e.origem}</small></div></div></div>`;
      });
      return h + '<div class="pr-leg">● Visita (ACS) &nbsp; ● Exame &nbsp; ● Consulta &nbsp; ● Retorno</div>';
    }
    function prIndicadores(c) {
      if (indDetalhe) {
        const k = indDetalhe, r = prChecklist(c, k), chave = chaveProntuario;
        return `<button class="pr-voltar" onclick="indDetalhe=null;renderProntuario()">‹ Voltar</button><div class="pr-bloco"><div class="pr-grande" style="color:${PR_COR[k]}">${r.feitos} <small>de ${r.total} feitos</small></div><div class="pr-barra"><i style="width:${r.total ? Math.round(r.feitos / r.total * 100) : 100}%;background:${PR_COR[k]}"></i></div>${r.tempo && r.tempo.texto ? `<small>${escHtml(r.tempo.texto)}</small>` : ''}<small>${r.faltam ? 'Fechando os ' + r.faltam + ' que faltam, a pessoa passa a contar neste indicador.' : 'Meta atingida neste indicador.'}</small></div>
        <div class="pr-bloco">${r.itens.map(i => `<div class="pr-chk"><span class="pr-bola ${i.ok ? 'ok' : ''}">${i.ok ? '✓' : ''}</span><div><b>${escHtml(i.nome)}</b>${i.nota ? `<div class="${i.ok ? 'pr-nota' : 'pr-falta'}">${i.ok ? '' : 'Falta · '}${escHtml(i.nota)}</div>` : ''}${!i.ok && podeRegistrarVisita(c) && /visita/i.test(i.nome) ? `<button class="pr-mini" onclick="abrirModalVisita('${escHtml(chave)}')">Registrar na visita</button>` : ''}</div></div>`).join('')}</div>`;
      }
      return prIndsDe(c).map(k => { const r = prChecklist(c, k); return `<div class="pr-bloco pr-indlin" onclick="abrirIndProntuario('${k}')"><div class="pr-lin"><b style="color:${PR_COR[k]}">${k} · ${PR_NOMES[k]}</b><span class="tag ${r.faltam ? 'tag-danger' : 'tag-ok'}">${r.faltam ? 'Faltam ' + r.faltam : '✓ Meta atingida'}</span></div><div class="pr-barra"><i style="width:${r.total ? Math.round(r.feitos / r.total * 100) : 100}%;background:${PR_COR[k]}"></i></div><small>${r.feitos} de ${r.total} feitos ›</small></div>`; }).join('');
    }
    function prVacinas(c) {
      const v = prCartaoVacinas(c) || prVacTags(c); let hpv = ''; try { hpv = typeof badgeHpv === 'function' ? badgeHpv(c) : ''; } catch (e) {}
      return (v ? `<div class="pr-bloco"><div class="pr-tit">Busca ativa de vacinação</div>${v}</div>` : '<div class="pr-vazio">Sem dados de vacina importados para esta pessoa.</div>') + (hpv ? `<div class="pr-bloco"><div class="pr-tit">HPV</div>${hpv}</div>` : '');
    }
    function prNotas(chave, c) { return `<textarea class="area-anotacao" style="min-height:160px" placeholder="✍️ Anotações do ACS..." onchange="salvarAnotacao('${escHtml(chave)}', this.value)">${escHtml(c.anotacao || '')}</textarea>`; }

    function renderProntuario() {
      const c = BASE_DADOS.cidadaos[chaveProntuario]; if (!c) return;
      document.querySelectorAll('#modalProntuario .pr-aba[data-aba]').forEach(b => b.classList.toggle('ativa', b.dataset.aba === abaProntuario));
      const corpo = document.getElementById('prCorpo');
      const f = { resumo: () => prResumo(chaveProntuario, c), linha: () => prLinha(c, chaveProntuario), ind: () => prIndicadores(c), vac: () => prVacinas(c), notas: () => prNotas(chaveProntuario, c) }[abaProntuario];
      const y = corpo.scrollTop; corpo.innerHTML = prCabecalho(chaveProntuario, c) + f(); corpo.scrollTop = y;
      document.getElementById('prVisita').style.display = podeRegistrarVisita(c) ? '' : 'none';
    }
    function abrirProntuario(chave, aba) { chaveProntuario = chave; abaProntuario = aba || 'resumo'; indDetalhe = null; filtroLinha = 'tudo'; document.getElementById('prCorpo').scrollTop = 0; renderProntuario(); document.getElementById('modalProntuario').classList.add('aberto'); }
    function abrirIndProntuario(k) { abaProntuario = 'ind'; indDetalhe = k; document.getElementById('prCorpo').scrollTop = 0; renderProntuario(); }
    function fecharProntuario() { document.getElementById('modalProntuario').classList.remove('aberto'); chaveProntuario = null; }
    function trocarAbaProntuario(a) { abaProntuario = a; indDetalhe = null; renderProntuario(); }
    document.addEventListener('click', (e) => { const b = e.target.closest && e.target.closest('.btn-prontuario'); if (b) abrirProntuario(b.getAttribute('data-chave')); });
    (function () { const o = window.atualizarInterface; if (typeof o === 'function') window.atualizarInterface = function () { const r = o.apply(this, arguments); if (chaveProntuario) renderProntuario(); return r; }; })();
