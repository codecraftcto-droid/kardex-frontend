/**
 * Evaluación de permisos en el cliente (misma lógica que el backend).
 * SOLO para experiencia de usuario: el backend valida siempre.
 */
function cubre(a, r) {
  if (a.tipo === 'estudio') return true;
  if (a.tipo === 'empresa') return !!r.empresaId && r.empresaId === a.id;
  if (a.tipo === 'sede') return !!r.sedeId && r.sedeId === a.id;
  if (a.tipo === 'almacen') return !!r.almacenId && r.almacenId === a.id;
  return false;
}

export function tieneAlguno(perms, codigo) {
  if (!perms) return false;
  if ((perms.denies[codigo] || []).some((a) => a.tipo === 'estudio')) return false;
  return (perms.grants[codigo] || []).length > 0;
}

export function puede(perms, codigo, recurso) {
  if (!perms) return false;
  if (!recurso) return tieneAlguno(perms, codigo);
  if ((perms.denies[codigo] || []).some((a) => cubre(a, recurso))) return false;
  return (perms.grants[codigo] || []).some((a) => cubre(a, recurso));
}

/** ¿Tiene el permiso en algún alcance dentro de la empresa (incluye sedes/almacenes)? */
export function puedeEnEmpresa(perms, codigo, empresaId) {
  if (!perms || !empresaId) return false;
  const grants = perms.grants[codigo] || [];
  const denies = perms.denies[codigo] || [];
  if (denies.some((a) => a.tipo === 'estudio' || (a.tipo === 'empresa' && a.id === empresaId))) return false;
  return grants.some((a) => a.tipo === 'estudio' || a.empresaId === empresaId);
}
