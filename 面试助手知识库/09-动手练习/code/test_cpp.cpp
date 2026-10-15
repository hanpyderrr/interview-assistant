#include "solutions.hpp"
#include <algorithm>
#include <chrono>
#include <deque>
#include <future>
#include <iostream>
#include <random>
#include <stdexcept>
#include <string>
#include <thread>

using Bytes = std::vector<std::uint8_t>;
void check(bool ok, const char* message) {
    if (!ok) throw std::runtime_error(message);
}
Bytes frame(const Bytes& payload) {
    Bytes out{0xaa, 0x55, static_cast<std::uint8_t>(payload.size())};
    std::uint8_t checksum = out.back();
    for (auto x : payload) { out.push_back(x); checksum ^= x; }
    out.push_back(checksum);
    return out;
}
void ring_tests() {
    RingBuffer ring(3);
    check(ring.write({1,2,3,4}) == 3, "ring: bounded write");
    check(ring.write({9}) == 0, "ring: reject full");
    check(ring.read(2) == Bytes({1,2}), "ring: FIFO");
    check(ring.write({4,5}) == 2, "ring: wrap write");
    check(ring.read(10) == Bytes({3,4,5}), "ring: wrap read");
    check(ring.read(0).empty() && ring.read(1).empty(), "ring: empty");
    bool rejected = false;
    try { RingBuffer invalid(0); } catch (const std::invalid_argument&) { rejected = true; }
    check(rejected, "ring: zero capacity");
    RingBuffer random_ring(7);
    std::deque<std::uint8_t> expected;
    std::mt19937 rng(123);
    for (int i=0; i<1000; ++i) {
        if (rng()%2) {
            Bytes input(rng()%12);
            for (auto& x : input) x = rng()%256;
            auto n = std::min(input.size(), 7-expected.size());
            check(random_ring.write(input)==n, "ring: randomized write count");
            expected.insert(expected.end(),input.begin(),input.begin()+n);
        } else {
            auto n = std::min<std::size_t>(rng()%12,expected.size());
            Bytes output(expected.begin(),expected.begin()+n);
            check(random_ring.read(n)==output,"ring: randomized FIFO");
            expected.erase(expected.begin(),expected.begin()+n);
        }
    }
}
void parser_tests() {
    const Bytes payload{1,2,0xaa,0x55,3};
    const auto good = frame(payload);
    for (std::size_t split=0; split<=good.size(); ++split) {
        Parser parser;
        auto out=parser.feed(Bytes(good.begin(),good.begin()+split));
        auto next=parser.feed(Bytes(good.begin()+split,good.end()));
        out.insert(out.end(),next.begin(),next.end());
        check(out==std::vector<Bytes>{payload},"parser: every split, embedded magic");
    }
    Parser p;
    auto bad=frame({7}); bad.back()^=1;
    Bytes input{0,0xaa,0x12,0xaa,0x55,255};
    input.insert(input.end(),bad.begin(),bad.end());
    auto empty=frame({}); input.insert(input.end(),empty.begin(),empty.end());
    input.insert(input.end(),good.begin(),good.end());
    check(p.feed(input)==std::vector<Bytes>({{},payload}),"parser: noise, bad checksum and length");
    Parser random;
    Bytes stream;
    std::vector<Bytes> expected;
    std::mt19937 rng(17);
    for (int i=0;i<100;++i) {
        Bytes bytes(rng()%33);
        for (auto& x:bytes) x=rng()%256;
        expected.push_back(bytes);
        auto encoded=frame(bytes); stream.insert(stream.end(),encoded.begin(),encoded.end());
    }
    std::vector<Bytes> actual;
    for (std::size_t i=0;i<stream.size();) {
        auto n=std::min<std::size_t>(1+rng()%11,stream.size()-i);
        auto out=random.feed(Bytes(stream.begin()+i,stream.begin()+i+n));
        actual.insert(actual.end(),out.begin(),out.end()); i+=n;
        check(random.buffered()<=36,"parser: bounded state");
    }
    check(actual==expected,"parser: randomized chunks");
    p.feed({0xaa,0x55,32}); p.reset();
    check(p.feed(good)==std::vector<Bytes>{payload},"parser: reset truncated connection");
}
void queue_tests() {
    using namespace std::chrono_literals;
    BoundedQueue q(2);
    check(q.push(1) && q.push(2),"queue: accept items");
    q.close(); q.close();
    check(!q.push(3),"queue: reject after close");
    check(q.pop()==1 && q.pop()==2 && !q.pop(),"queue: drain before EOF");
    bool rejected=false;
    try { BoundedQueue invalid(0); } catch (const std::invalid_argument&) { rejected=true; }
    check(rejected,"queue: zero capacity");
    BoundedQueue empty(1);
    auto consumer=std::async(std::launch::async,[&]{return empty.pop();});
    check(consumer.wait_for(20ms)==std::future_status::timeout,"queue: wait on empty");
    empty.close();
    check(consumer.wait_for(1s)==std::future_status::ready && !consumer.get(),"queue: wake consumer");
    BoundedQueue full(1); full.push(7);
    auto producer=std::async(std::launch::async,[&]{return full.push(8);});
    check(producer.wait_for(20ms)==std::future_status::timeout,"queue: wait on full");
    full.close();
    check(producer.wait_for(1s)==std::future_status::ready && !producer.get(),"queue: wake producer");
    BoundedQueue shared(8);
    std::vector<int> received;
    std::mutex received_mutex;
    std::vector<std::thread> consumers,producers;
    for(int i=0;i<3;++i) consumers.emplace_back([&]{
        while(auto value=shared.pop()) {
            std::lock_guard<std::mutex> lock(received_mutex);
            received.push_back(*value);
        }
    });
    for(int p=0;p<4;++p) producers.emplace_back([&,p]{
        for(int i=0;i<100;++i) shared.push(p*100+i);
    });
    for(auto& t:producers)t.join(); shared.close();
    for(auto& t:consumers)t.join();
    std::sort(received.begin(),received.end());
    check(received.size()==400,"queue: no lost items");
    for(int i=0;i<400;++i)check(received[i]==i,"queue: no duplicate items");
}
int main(int argc,char** argv) {
    try {
        std::string group=argc>1?argv[1]:"all";
        if(group=="ring" || group=="all") ring_tests();
        if(group=="parser" || group=="all") parser_tests();
        if(group=="queue" || group=="all") queue_tests();
        std::cout<<"PASS: "<<group<<"\n";
    } catch(const std::exception& e) {std::cerr<<e.what()<<"\n"; return 1;}
}
