-- Sahip kodunu tamamen kaldır.
--
-- NEDEN
--
-- Kod sızmıştı: @oyuncu32661 sınırsız oy bayrağını tam olarak bu yoldan aldı
-- (profiles.unlimited_votes true, ama kullanıcı adı tabanlı eski listede yok —
-- geriye tek yol olarak claim_unlimited kalıyor). Bir önceki göç claim_unlimited'ı
-- kapattı, yani kod artık hiçbir şeye yaramıyor. Yaramayan ama duran bir sır
-- yalnızca risktir: bir gün biri fonksiyonu "geri açar" ve sızmış kod yeniden
-- geçerli olur.
--
-- Sınırsız oy hakkı bundan sonra yalnızca SQL Editor'dan veriliyor:
--   select public.grant_unlimited('kullanici_adi');
--   select public.revoke_unlimited('kullanici_adi');

set local lock_timeout = '5s';

delete from public.app_secrets where key = 'owner_code';

/*
 * set_owner_code de emekli.
 *
 * Fonksiyonu silmek yerine açıkça reddediyoruz: silinseydi, eski bir not ya da
 * belgeye bakıp çalıştıran biri "fonksiyon yok" hatası görür ve bunun bir
 * kurulum eksiği olduğunu sanırdı. Böylece sebebi de okuyor.
 */
create or replace function public.set_owner_code(p_code text)
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  return 'Sahip kodu mekanizması kaldırıldı. Sınırsız oy hakkı için: '
      || 'select public.grant_unlimited(''kullanici_adi'');';
end;
$$;

revoke all on function public.set_owner_code(text) from public, anon, authenticated;
