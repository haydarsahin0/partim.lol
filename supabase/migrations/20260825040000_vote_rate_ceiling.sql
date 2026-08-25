-- Betikle oy yağdırmayı durdur: "sınırsız" artık "sonsuz hızlı" demek değil.
--
-- NE OLDU
--
-- Bir hesap Bartın'a 9 dakika 25 saniyede 1671 oy attı. Oylar arası aralık
-- dağılımı tek başına yeterli kanıt: 2408 aralık SIFIR saniye. İnsan böyle oy
-- vermez; istek doğrudan betikle atılıyordu.
--
-- NEDEN GEÇTİ
--
-- profiles.unlimited_votes bayrağı iki şeyi birden kaldırıyordu: bekleme
-- süresini (interval '0') VE cihaz bütçesini (muafiyet). Geriye hiçbir sınır
-- kalmıyordu — saniyede kaç istek atarsan o kadar oy. Bayrağı almanın yolu da
-- açıktı: claim_unlimited(kod) fonksiyonu, sahip kodunu bilen HERKESE, istediği
-- kadar hesapta, kalıcı olarak veriyordu. Kod tek ve değişmez bir metin;
-- bir kez sızdığında geri alınamıyordu.
--
-- BU GÖÇ NE YAPIYOR
--
--   1. HERKESE tavan. Sınırsız hak, bekleme süresini kaldırır ama dakikadaki
--      oy sayısına tavan koyar. Elle tıklayan kimse bu tavana çarpmaz.
--   2. claim_unlimited kapatıldı. Sınırsız hak artık yalnızca SQL Editor'dan,
--      elle veriliyor. Uygulamadan geçen hiçbir yol kalmadı.
--   3. vote_privileges KULLANICI ADINA değil profil kimliğine bağlandı.
--      Ad değiştirilebiliyor: ayrıcalıklı adı bırakan biri olsa, o adı alan
--      sonraki kişi sınırsız oy hakkını devralırdı.
--   4. Hak kimde, ne zaman verildi — vote_privileges.created_at'te kayıtlı.

/*
 * Kilit beklemesi kilitlenmeye dönüşmesin.
 *
 * Bu göç canlı bir veritabanına, üstelik oy akarken uygulanıyor. Bir kilidi
 * dakikalarca beklemektense saniyeler içinde vazgeçip anlaşılır bir hatayla
 * düşmek daha iyi: tekrar çalıştırmak zaten güvenli.
 */
set local lock_timeout = '5s';

-- ---------------------------------------------------------------------------
-- 1. Dakikalık tavan — sınırsız hak dâhil herkese
-- ---------------------------------------------------------------------------

/*
 * Dakikada en fazla kaç oy?
 *
 * Ölçek: normal oyuncu dakikada 1, günlük aboneliği olan 4 oy kullanıyor.
 * 30, elle tıklayan hiç kimsenin ulaşamayacağı kadar yüksek (iki saniyede bir
 * oy) ama betiğin işine yaramayacak kadar düşük. Sınırsız hakkı olan hesap
 * bekleme süresinden muaf kalmaya devam ediyor; muaf olmadığı tek şey bu tavan.
 *
 * Miting oyları sayılmıyor: onlar tek işlemde 100 satır yazıyor ve kendi
 * günlük sınırı var.
 */
create or replace function public.vote_rate_ok(p_profile uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select count(*) < 30
  from public.votes
  where user_id = p_profile
    and created_at > now() - interval '1 minute'
    and source is distinct from 'rally';
$$;

revoke all on function public.vote_rate_ok(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Ayrıcalık kullanıcı adına değil hesaba bağlansın
-- ---------------------------------------------------------------------------

alter table public.vote_privileges
  add column if not exists profile_id uuid references public.profiles (id) on delete cascade;

create index if not exists vote_privileges_profile_idx
  on public.vote_privileges (profile_id) where profile_id is not null;

-- Elimizdeki satırları o adı ŞU AN taşıyan hesaba bağla.
update public.vote_privileges vp
   set profile_id = p.id
  from public.profiles p
 where vp.profile_id is null
   and lower(p.handle) = lower(vp.handle);

/*
 * "Hak ne zaman verildi" bilgisi profiles'a DEĞİL buraya yazılıyor.
 *
 * İlk denemede profiles'a bir sütun ekliyordu ve göç kilitlenmeye düştü:
 * ALTER TABLE, tabloda AccessExclusiveLock istiyor; oy yağdıran betik ise
 * cast_vote içinden aynı tabloda satır kilidi tutuyordu. Yani saldırı, tam
 * kendisini durduracak düzeltmenin uygulanmasını engelliyordu.
 *
 * vote_privileges yoğun bir tablo değil ve zaten created_at taşıyor; bilgi
 * orada dursun. Denetim kaydı için sıcak tabloyu kilitlemeye değmez.
 */
-- ---------------------------------------------------------------------------
-- 3. Sınırsız hak yalnızca elle verilsin
-- ---------------------------------------------------------------------------

/*
 * claim_unlimited artık hak VERMİYOR.
 *
 * Fonksiyon duruyor çünkü istemci hâlâ çağırabiliyor; kaldırsaydık kullanıcı
 * anlaşılmaz bir hata görürdü. Kod doğru bile olsa yanıt aynı: bu yol kapandı.
 */
create or replace function public.claim_unlimited(p_code text)
returns json
language plpgsql
security definer
set search_path = public
as $$
begin
  -- p_code okunmuyor bile: karşılaştırmak, kodun hâlâ bir işe yaradığı
  -- izlenimini verirdi.
  return json_build_object(
    'ok', false,
    'message', 'Bu yol kapatıldı. Sınırsız oy hakkı artık kod ile verilmiyor.'
  );
end;
$$;

/*
 * Sahibin kendi hakkını vermesi için: yalnızca SQL Editor'dan.
 *
 *   select public.grant_unlimited('oyuncu47172');
 *   select public.revoke_unlimited('oyuncu32661');
 */
create or replace function public.grant_unlimited(p_handle text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  select id into v_id from public.profiles where lower(handle) = lower(trim(p_handle));
  if v_id is null then
    return json_build_object('ok', false, 'message', 'Böyle bir hesap yok.');
  end if;

  update public.profiles
     set unlimited_votes = true,
         next_vote_at = null
   where id = v_id;

  insert into public.vote_privileges (handle, profile_id, unlimited, note)
  values (trim(p_handle), v_id, true, 'elle verildi')
  on conflict (handle) do update
    set unlimited = true, profile_id = excluded.profile_id;

  return json_build_object('ok', true, 'profile_id', v_id);
end;
$$;

create or replace function public.revoke_unlimited(p_handle text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  select id into v_id from public.profiles where lower(handle) = lower(trim(p_handle));
  if v_id is null then
    return json_build_object('ok', false, 'message', 'Böyle bir hesap yok.');
  end if;

  update public.profiles
     set unlimited_votes = false
   where id = v_id;

  delete from public.vote_privileges where profile_id = v_id or lower(handle) = lower(trim(p_handle));

  return json_build_object('ok', true, 'profile_id', v_id);
end;
$$;

revoke all on function public.grant_unlimited(text)  from public, anon, authenticated;
revoke all on function public.revoke_unlimited(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Oy kullanma: tavan denetimi
-- ---------------------------------------------------------------------------

create or replace function public.cast_vote(p_province_id text, p_party_id text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile   uuid := public.current_profile_id();
  v_next      timestamptz;
  v_unlimited boolean;
  v_bekleme   interval;
  v_yeni      timestamptz;
begin
  if v_profile is null then
    return json_build_object('ok', false, 'message', 'Hesap bulunamadı.');
  end if;
  if not exists (select 1 from public.provinces where id = p_province_id) then
    return json_build_object('ok', false, 'message', 'Böyle bir il yok.');
  end if;
  if not exists (select 1 from public.parties where id = p_party_id) then
    return json_build_object('ok', false, 'message', 'Böyle bir parti yok.');
  end if;

  -- Aynı anda gelen iki isteğin ikisinin de geçmesini engellemek için satır
  -- kilidi. Bekleme süresi kilitli satırdan tek okumada geliyor.
  select next_vote_at,
         coalesce(unlimited_votes, false),
         case
           when coalesce(unlimited_votes, false) then interval '0'
           when fast_votes_until is not null and fast_votes_until > now()
             then interval '15 seconds'
           else interval '1 minute'
         end
    into v_next, v_unlimited, v_bekleme
  from public.profiles
  where id = v_profile
  for update;

  if not found then
    return json_build_object('ok', false, 'message', 'Hesap bulunamadı.');
  end if;

  /*
   * Eski liste artık PROFİL KİMLİĞİNE bakıyor.
   *
   * Önce kullanıcı adına bakıyordu. Ad değiştirilebildiği için, ayrıcalıklı adı
   * bırakan biri olsa o adı alan sonraki kişi hakkı devralırdı — kimsenin
   * fark etmeyeceği bir yetki yükselmesi.
   */
  if not v_unlimited then
    select coalesce(bool_or(unlimited), false) into v_unlimited
    from public.vote_privileges where profile_id = v_profile;
    if v_unlimited then v_bekleme := interval '0'; end if;
  end if;

  if not v_unlimited and v_next is not null and v_next > now() then
    return json_build_object('ok', false, 'message', 'Oy hakkın henüz dolmadı.',
                             'next_vote_at', v_next);
  end if;

  /*
   * TAVAN — sınırsız hak dâhil HERKESE.
   *
   * Sınırsız hak bekleme süresini kaldırıyor, throughput'u değil. Bu satır
   * olmadığı için tek bir hesap dakikada 180 oy atabiliyordu.
   */
  if not public.vote_rate_ok(v_profile) then
    return json_build_object(
      'ok', false,
      'message', 'Çok hızlı oy kullanıyorsun. Biraz bekle.'
    );
  end if;

  -- Cihaz bütçesi: sınırsız hakkı olan muaf, çünkü tavan onu zaten tutuyor.
  if not v_unlimited and not public.device_vote_budget_ok(v_profile) then
    return json_build_object(
      'ok', false,
      'message', 'Bu cihazdan çok hızlı oy kullanılıyor. Biraz bekle.'
    );
  end if;

  insert into public.votes (user_id, province_id, party_id)
  values (v_profile, p_province_id, p_party_id);

  insert into public.province_tallies (province_id, party_id, votes)
  values (p_province_id, p_party_id, 1)
  on conflict (province_id, party_id)
    do update set votes = public.province_tallies.votes + 1;

  v_yeni := case when v_unlimited then null else now() + v_bekleme end;

  update public.profiles
     set xp           = xp + 1,
         vote_count   = vote_count + 1,
         next_vote_at = v_yeni,
         last_seen_at = now(),
         trusted_at   = case
                          when trusted_at is null
                               and public.profile_trusted(vote_count + 1, leader_count)
                          then now() else trusted_at
                        end
   where id = v_profile;

  return json_build_object('ok', true, 'next_vote_at', v_yeni);
end;
$$;

revoke all on function public.cast_vote(text, text) from public;
grant execute on function public.cast_vote(text, text) to authenticated;
